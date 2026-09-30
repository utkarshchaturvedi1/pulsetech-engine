import assert from 'node:assert/strict';
import { createBusinessProfile } from '../src/lib/businessProfile';
import { mergeOwnerProfileUpdate } from '../src/lib/ownerProfileUpdate';
import { buildIntentAwarePriceAnswer } from '../src/lib/salesConversation';
import { createInitialSalesState } from '../src/lib/salesState';

const business = createBusinessProfile({
  website: 'https://business.test', businessName: 'Business',
  services: ['Equipment installation'],
  pricingRules: 'Visiting charge is $20. Waived if the customer proceeds with our services.',
  leadQuestions: ['Do you have dogs at the property?'],
  systemPrompt: 'Use protective covers inside the property.',
});
const updated = mergeOwnerProfileUpdate(business, {
  leadQuestions: ['Is there a parking restriction?'],
  systemPrompt: 'Explain that the owner must approve changes to the scope.',
});
assert(updated.leadQuestions.includes(business.leadQuestions[0]), 'Adding a question must retain previous owner questions');
assert(updated.systemPrompt.includes(business.systemPrompt), 'Adding a rule must retain previous owner rules');
const state = createInitialSalesState();
state.customerNeed = state.primaryNeed = 'Install equipment in my garage';
const price = buildIntentAwarePriceAnswer(state, business);
assert(/total|project|overall/i.test(price), 'Visit fee must not be the entire project-price answer');
assert(/separate|not the|only/i.test(price), 'Visit fee must be distinguished from the service total');
assert(/waiv/i.test(price), 'Verified waiver must be preserved');
console.log('PASS — accumulated owner rules and visit-fee pricing scope');

import { generateSalesReply } from '../src/lib/salesChat';
import { evaluateHandoffReadiness, shouldAttemptLeadHandoff, buildLeadNotificationEmail } from '../src/lib/leadHandoff';
import { buildPricingApproachAnswer } from '../src/lib/schedulingPolicy';
import { validateSalesReply, updateSalesStateFromTurn } from '../src/lib/salesController';
import { synchronizeOwnerQuestions, ownerQuestionReply } from '../src/lib/ownerQuestions';
import { commitSharedProfile, loadSharedProfile, resolveCurrentChatProfile, ProfileUpdateConflict } from '../src/lib/sharedProfileStore';
import { promises as fs } from 'node:fs';

function secured() {
  const s = createInitialSalesState({conversationId:'conv_owner_scope_test',businessKey:business.website});
  s.lead = {name:'Jamie',phone:'2145550199',address:'100 Main St, Dallas TX 75201',email:null};
  s.intent = 'HIGH'; s.leadStatus = 'SECURED'; s.salesStage = 'SALES_MODE';
  s.customerNeed = s.primaryNeed = 'Install equipment in my garage';
  return s;
}

async function run() {
  const savedEnv = {...process.env}; const originalFetch = globalThis.fetch;
  delete process.env.OPENAI_API_KEY;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.LEAD_HANDOFF_DRY_RUN = 'true';
  try {
    const websiteProfile = createBusinessProfile({
      website:'https://scraped-business.test', businessName:'Website Business',
      tagline:'Website tagline', phone:'2145550100', email:'office@example.test',
      address:'200 Website St, Dallas TX', logo:'/website-logo.svg',
      services:['Equipment installation','Equipment maintenance'], serviceAreas:['Dallas','Plano'],
      businessHours:'Monday–Friday 8am–5pm',
      faqs:[{question:'Do you service existing equipment?',answer:'Yes, existing equipment is serviced.'}],
      systemPrompt:'Website fact: protective covers are used. Website policy: appointments require owner approval.',
    });
    const withOwnerRule = mergeOwnerProfileUpdate(websiteProfile,{
      leadQuestions:['Do you have dogs at the property?'],
      pricingRules:'Visiting charge is $20. Waived if work proceeds.',
      systemPrompt:'Ask whether dogs are present before handing off.',
    });
    for (const key of ['website','businessName','tagline','phone','email','address','logo','services','serviceAreas','businessHours','faqs'] as const) {
      assert.deepEqual(withOwnerRule[key],websiteProfile[key],`Peter addition must preserve website field ${key}`);
    }
    assert(withOwnerRule.systemPrompt.includes(websiteProfile.systemPrompt));
    const correctedWebsiteFact = mergeOwnerProfileUpdate(withOwnerRule,{
      removeValues:{systemPrompt:['Website policy: appointments require owner approval.']},
      systemPrompt:'Website policy correction: appointments require manager approval.',
    });
    assert(correctedWebsiteFact.systemPrompt.includes('protective covers are used'));
    assert(correctedWebsiteFact.systemPrompt.includes('manager approval'));
    assert(!correctedWebsiteFact.systemPrompt.includes('owner approval'));
    assert(correctedWebsiteFact.systemPrompt.includes('dogs are present'));
    assert.deepEqual(correctedWebsiteFact.faqs,websiteProfile.faqs);
    const {formatBusinessKnowledge}=await import('../src/lib/businessKnowledge');
    const customerKnowledge=formatBusinessKnowledge(correctedWebsiteFact);
    assert(customerKnowledge.includes('Equipment maintenance') && customerKnowledge.includes('existing equipment is serviced') && customerKnowledge.includes('manager approval') && customerKnowledge.includes('dogs are present'));
    const websiteId='website-owner-preservation-'+Date.now();
    try {
      await commitSharedProfile(websiteId,correctedWebsiteFact);
      const rebound=await resolveCurrentChatProfile(websiteProfile,websiteId);
      assert.deepEqual(rebound.services,websiteProfile.services);assert.deepEqual(rebound.faqs,websiteProfile.faqs);
      assert(rebound.systemPrompt.includes('manager approval') && rebound.systemPrompt.includes('dogs are present'));
    } finally {await fs.rm(`.data/demos/${websiteId}.json`,{force:true});}
    console.log('PASS — website services, FAQs, identity, hours and facts survive Peter additions, targeted correction and saved-profile reload');
    let many = business;
    for (let i=0;i<100;i++) many = mergeOwnerProfileUpdate(many, {leadQuestions:[`Required question ${i}?`],systemPrompt:`Business rule ${i}.`});
    assert.equal(many.leadQuestions.length,101,'No small instruction-count cap');
    assert(many.systemPrompt.includes('Business rule 0.') && many.systemPrompt.includes('Business rule 99.'));
    const corrected = mergeOwnerProfileUpdate(many,{removeValues:{leadQuestions:[business.leadQuestions[0]],pricingRules:[business.pricingRules!]},leadQuestions:['Are there animals on the property?'],pricingRules:'Visiting charge is $30. Waived if work proceeds.'});
    assert.equal(corrected.leadQuestions.length,101);
    assert(corrected.leadQuestions.includes('Required question 0?'));
    assert(!corrected.pricingRules?.includes('$20'));
    assert.throws(()=>mergeOwnerProfileUpdate(business,{pricingRules: {fee:20} as never}));
    assert.throws(()=>mergeOwnerProfileUpdate(business,{removeValues:{leadQuestions:['Unknown question?']}}));

    for (const need of ['Install a charger in my garage','Repair a leaking pipe','Replace damaged roof tiles','Plan a celebration','Get strategy advice']) {
      const s=secured();s.primaryNeed=s.customerNeed=need;
      const answer=buildIntentAwarePriceAnswer(s,business,'What is the overall cost?');
      assert(/depends/.test(answer)); assert(answer.includes('$20')); assert(/not the total/.test(answer)); assert(/waiv/i.test(answer));
      assert(!validateSalesReply('The total project cost is $20.',s,business,'How much is the full project?').ok);
      assert(!validateSalesReply('The visiting charge is $20.',s,business,'How much is the full project?').ok);
    }
    assert.equal(buildIntentAwarePriceAnswer(secured(),business,'What is the visiting fee?'),business.pricingRules);
    assert(/not the total/.test(buildPricingApproachAnswer(business,'What is the overall cost?')));
    const mixed={...business,pricingRules:'Equipment installation costs $800. Diagnostic visit costs $20. Waived if work proceeds.'};
    assert(buildIntentAwarePriceAnswer(secured(),mixed,'What does installation cost?').includes('$800'));
    const firstPrice=buildIntentAwarePriceAnswer(secured(),business,'How much?');const repeated=secured();repeated.priceQuestionCount=2;
    const repeatPrice=buildIntentAwarePriceAnswer(repeated,business,'How much is the overall project?');
    assert.notEqual(firstPrice,repeatPrice);assert(!repeatPrice.includes('$20'));

    const ownerBusiness={...business,leadQuestions:[...business.leadQuestions,'Is there a parking restriction?'],leadNotificationEmail:'alerts@example.test',leadNotificationPhone:'+12145550199'};
    let s=secured();s.customerAgreed=true;s.preferredTiming='tomorrow morning';
    let result=await generateSalesReply(ownerBusiness,[{role:'user',content:'Please proceed tomorrow morning'}],s);
    assert.equal(result.reply,ownerBusiness.leadQuestions[0]);assert.equal(result.salesState.leadDeliveryStatus,'NOT_SENT');
    assert(!evaluateHandoffReadiness(result.salesState).handoffReady);assert(!shouldAttemptLeadHandoff(result.salesState,'inactivity'));
    const firstAsk=result.reply;
    result=await generateSalesReply(ownerBusiness,[{role:'assistant',content:firstAsk},{role:'user',content:'How much is the overall cost?'}],result.salesState);
    assert(result.reply.endsWith(firstAsk));assert.equal(Object.keys(result.salesState.ownerQuestionAnswers).length,0);
    const priceReply=result.reply;
    result=await generateSalesReply(ownerBusiness,[{role:'assistant',content:priceReply},{role:'user',content:'No, we do not have dogs'}],result.salesState);
    assert.equal(result.reply,ownerBusiness.leadQuestions[1]);assert.equal(result.salesState.leadDeliveryStatus,'NOT_SENT');
    result=await generateSalesReply(ownerBusiness,[{role:'assistant',content:result.reply},{role:'user',content:'No restriction'}],result.salesState);
    assert.equal(Object.keys(result.salesState.ownerQuestionAnswers).length,2);assert(['QUEUED','SENT'].includes(result.salesState.leadDeliveryStatus));
    assert(buildLeadNotificationEmail(ownerBusiness,result.salesState).text.includes('No, we do not have dogs'),'Owner answers must reach the business');
    assert(!shouldAttemptLeadHandoff(result.salesState,'closure','Please proceed'));
    const next=synchronizeOwnerQuestions(result.salesState,{...ownerBusiness,leadQuestions:[...ownerBusiness.leadQuestions,'Is approval from the property owner needed?']});
    assert(!evaluateHandoffReadiness({...next,leadDeliveryStatus:'NOT_SENT'}).handoffReady);
    const yesState=synchronizeOwnerQuestions(secured(),ownerBusiness);ownerQuestionReply(yesState);
    const yesAnswer=updateSalesStateFromTurn(yesState,[{role:'assistant',content:ownerBusiness.leadQuestions[0]},{role:'user',content:'Yes please'}],ownerBusiness);
    assert.equal(yesAnswer.customerAgreed,false,'Qualification yes must not count as appointment agreement');
    const pre=createInitialSalesState();pre.primaryNeed=pre.customerNeed='Install equipment';
    const opening=await generateSalesReply(ownerBusiness,[{role:'user',content:'I need to install equipment'}],pre);
    assert(/first name/.test(opening.reply));assert(!opening.reply.includes(firstAsk),'Owner question must follow core capture');

    const id='owner-accumulation-regression-'+Date.now();
    try {
      await commitSharedProfile(id,many);
      const loaded=await loadSharedProfile(id);assert.equal(loaded?.profile.leadQuestions.length,101);
      const latest=await resolveCurrentChatProfile(business,id);assert.equal(latest.leadQuestions.length,101,'Stale browser profile must be rebound');
      const {PUT}=await import('../src/app/api/demo/[id]/route');
      const {NextRequest}=await import('next/server');
      const response=await PUT(new NextRequest('https://example.test/api/demo/'+id,{method:'PUT',body:JSON.stringify({profile:{...business,leadQuestions:[],systemPrompt:'Stale browser rules',leadNotificationEmail:'new-alerts@example.test'}})}),{params:Promise.resolve({id})});
      assert.equal(response.status,200);const afterOnboarding=await loadSharedProfile(id);
      assert.equal(afterOnboarding?.profile.leadQuestions.length,101,'Stale onboarding save must preserve saved instructions');
      assert.equal(afterOnboarding?.profile.leadNotificationEmail,'new-alerts@example.test');
      await assert.rejects(()=>resolveCurrentChatProfile({...business,website:'https://other.test'},id));
    } finally {await fs.rm(`.data/demos/${id}.json`,{force:true});}

    process.env.VERCEL='1';process.env.NEXT_PUBLIC_SUPABASE_URL='https://example.supabase.co';process.env.SUPABASE_SERVICE_ROLE_KEY='test-only';
    let observed:RequestInit|undefined;
    globalThis.fetch=(async (_input:RequestInfo|URL,init?:RequestInit)=>{observed=init;return new Response('[]',{status:200,headers:{'Content-Type':'application/json'}});}) as typeof fetch;
    await assert.rejects(()=>commitSharedProfile('concurrent-owner',business,'2026-09-30T00:00:00Z'),ProfileUpdateConflict);
    assert.equal(observed?.method,'PATCH','Concurrent updates must compare saved version atomically');
    await assert.rejects(()=>commitSharedProfile('concurrent-owner',business,''),ProfileUpdateConflict);
    assert.equal(observed?.method,'POST');assert(String(observed?.headers && (observed.headers as Record<string,string>).Prefer).includes('ignore-duplicates'),'First saved version must not overwrite a concurrent initial write');
    globalThis.fetch=originalFetch;delete process.env.SUPABASE_SERVICE_ROLE_KEY;delete process.env.VERCEL;

    process.env.OPENAI_API_KEY='test-only';
    const pendingState=synchronizeOwnerQuestions(secured(),ownerBusiness);ownerQuestionReply(pendingState);
    globalThis.fetch=(async()=>new Response(JSON.stringify({id:'resp_check',object:'response',output:[{type:'message',role:'assistant',content:[{type:'output_text',text:'{"answersQuestion":false}',annotations:[]}]}]}),{status:200,headers:{'Content-Type':'application/json'}})) as typeof fetch;
    const unrelated=await generateSalesReply(ownerBusiness,[{role:'assistant',content:firstAsk},{role:'user',content:'I am still thinking about the installation'}],pendingState);
    assert.equal(Object.keys(unrelated.salesState.ownerQuestionAnswers).length,0,'Unrelated response must not complete required question');
    const openQuestionBusiness={...ownerBusiness,leadQuestions:['Describe the project you need help with.',...ownerBusiness.leadQuestions]};
    const openState=synchronizeOwnerQuestions(secured(),openQuestionBusiness);
    const openAsk=ownerQuestionReply(openState)!;
    const bare=await generateSalesReply(openQuestionBusiness,[{role:'assistant',content:openAsk},{role:'user',content:'Yes'}],openState);
    assert.equal(bare.reply,openAsk,'Bare acknowledgement must not complete an open-ended question');
    assert(!bare.salesState.ownerQuestionAnswers[openAsk]);
    const explicitDescription=await generateSalesReply(openQuestionBusiness,[{role:'assistant',content:openAsk},{role:'user',content:'I want to install new equipment in my garage'}],openState);
    assert.equal(explicitDescription.reply,firstAsk,'Explicit description must advance even when the remote checker rejects/fails');
    globalThis.fetch=(async()=>new Response(JSON.stringify({id:'resp_check',object:'response',output:[{type:'message',role:'assistant',content:[{type:'output_text',text:'{"answersQuestion":true}',annotations:[]}]}]}),{status:200,headers:{'Content-Type':'application/json'}})) as typeof fetch;
    const qualified=await generateSalesReply(ownerBusiness,[{role:'assistant',content:firstAsk},{role:'user',content:'There are two, but they stay in the back yard'}],pendingState);
    assert.equal(qualified.reply,ownerBusiness.leadQuestions[1],'Natural answer must advance to next required question');
    const descriptionBusiness={...ownerBusiness,leadQuestions:['Can you describe the electrical problem or project you need help with?',...ownerBusiness.leadQuestions]};
    const descriptionState=synchronizeOwnerQuestions(secured(),descriptionBusiness);
    const descriptionAsk=ownerQuestionReply(descriptionState)!;
    for (const reply of ['I want to install a car charger in my garage I bought a new electric car','I need to repair equipment in my workshop']) {
      const described=await generateSalesReply(descriptionBusiness,[{role:'assistant',content:descriptionAsk},{role:'user',content:reply}],descriptionState);
      assert.equal(described.salesState.ownerQuestionAnswers[descriptionAsk],reply,'Verified project description must survive generic service-request filters');
      assert.equal(described.reply,firstAsk,'Answered project question must advance to the next owner question');
      assert.equal(described.salesState.leadDeliveryStatus,'NOT_SENT','Description must not bypass remaining required questions');
    }
    for (const [question,reply] of [['Which day is access available?','Tomorrow'],['Describe your project.','I prefer not to answer']]) {
      const contextualBusiness={...ownerBusiness,leadQuestions:[question,...ownerBusiness.leadQuestions]};
      const contextualState=synchronizeOwnerQuestions(secured(),contextualBusiness);
      ownerQuestionReply(contextualState);
      const contextual=await generateSalesReply(contextualBusiness,[{role:'assistant',content:question},{role:'user',content:reply}],contextualState);
      assert.equal(contextual.salesState.ownerQuestionAnswers[question],reply,'Verified timing/refusal must complete the actual question');
      assert.equal(contextual.reply,firstAsk);
    }
    const {applyOwnerFeedbackToProfile}=await import('../src/lib/updateBusinessProfile');
    globalThis.fetch=(async()=>new Response(JSON.stringify({id:'resp_owner',object:'response',output:[{type:'message',role:'assistant',content:[{type:'output_text',text:JSON.stringify({patch:{leadQuestions:['Is parking available?'],systemPrompt:'Ask whether parking is available.'}}),annotations:[]}]}]}),{status:200,headers:{'Content-Type':'application/json'}})) as typeof fetch;
    const ownerUpdate=await applyOwnerFeedbackToProfile(business,'Also check parking availability');
    assert(ownerUpdate.profile.leadQuestions.includes(firstAsk));assert(ownerUpdate.profile.systemPrompt.includes(business.systemPrompt));
    let modelCalls=0;
    globalThis.fetch=(async (_input:RequestInfo|URL,init?:RequestInit)=>{
      modelCalls++;const body=JSON.parse(String(init?.body));
      assert(body.instructions.includes('PRICE SCOPE CHECK'));assert(body.instructions.includes('Install equipment in my garage'));
      const text='The total project price depends on equipment choice, the distance to the supply, and available capacity. The visiting charge is $20, separate from the project cost, and waived if you proceed with our services. Would you like to arrange a consultation?';
      return new Response(JSON.stringify({id:'resp_test',object:'response',output:[{type:'message',role:'assistant',content:[{type:'output_text',text,annotations:[]}]}]}),{status:200,headers:{'Content-Type':'application/json'}});
    }) as typeof fetch;
    const enriched=await generateSalesReply({...business,leadQuestions:[]},[{role:'user',content:'How much does the overall project cost?'}],secured());
    assert(/distance to the supply/.test(enriched.reply),'Unknown pricing must receive relevant service guidance');assert.equal(modelCalls,1);
    globalThis.fetch=(async()=>new Response(JSON.stringify({id:'resp_bad',object:'response',output:[{type:'message',role:'assistant',content:[{type:'output_text',text:'The visiting charge is $20.',annotations:[]}]}]}),{status:200,headers:{'Content-Type':'application/json'}})) as typeof fetch;
    const checked=await generateSalesReply({...business,leadQuestions:[]},[{role:'user',content:'How much is the total project?'}],secured());
    assert(/depends/.test(checked.reply));assert(/not the total/.test(checked.reply),'Twice-invalid model reply must never reach customer');
    globalThis.fetch=(async()=>new Response(JSON.stringify({error:{message:'Unavailable'}}),{status:400,headers:{'Content-Type':'application/json'}})) as typeof fetch;
    const failed=await generateSalesReply({...business,leadQuestions:[]},[{role:'user',content:'How much is the full project?'}],secured());
    assert(/depends/.test(failed.reply),'Model failure must still return scoped safe pricing');
    console.log('PASS — 100 accumulated instructions, targeted correction, malformed patch rejection, reload/isolation, concurrent-save conflict');
    console.log('PASS — generic pricing scopes, visit waiver, repeat questions, handoff pricing, semantic generation, checker retry/fallback');
    console.log('PASS — mandatory owner questions, interrupted answers, core order, no premature/inactivity/duplicate handoff');
  } finally {
    globalThis.fetch=originalFetch;
    for(const key of Object.keys(process.env)) if(!(key in savedEnv)) delete process.env[key];
    Object.assign(process.env,savedEnv);
  }
}
run().catch(error=>{console.error(error);process.exitCode=1;});
