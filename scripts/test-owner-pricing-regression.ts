import assert from 'node:assert/strict';
import { createBusinessProfile } from '../src/lib/businessProfile';
import { mergeOwnerProfileUpdate } from '../src/lib/ownerProfileUpdate';
import { buildIntentAwarePriceAnswer, PRE_CONTACT_ASK_ADDRESS, PRE_CONTACT_ASK_FIRST_NAME, PRE_CONTACT_ASK_PHONE } from '../src/lib/salesConversation';
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
import { synchronizeOwnerQuestions, ownerQuestionReply, ownerQuestionClarification } from '../src/lib/ownerQuestions';
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
    const checkerRejects = (async () => new Response(JSON.stringify({ id: 'resp_check', object: 'response', output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: '{"answersQuestion":true}', annotations: [] }] }] }), { status: 200, headers: { 'Content-Type': 'application/json' } })) as typeof fetch;
    const checkerFails = (async () => { throw new Error('checker unavailable'); }) as typeof fetch;

    async function walk(profile: ReturnType<typeof createBusinessProfile>, turns: string[], fetchImpl?: typeof fetch) {
      if (fetchImpl) globalThis.fetch = fetchImpl;
      let state = createInitialSalesState({ conversationId: `conv_${profile.website}`, businessKey: profile.website });
      const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [];
      let reply = '';
      const steps: Array<{ user: string; reply: string; state: typeof state }> = [];
      for (const turn of turns) {
        messages.push({ role: 'user', content: turn });
        const result = await generateSalesReply(profile, messages, state);
        reply = result.reply;
        state = result.salesState;
        messages.push({ role: 'assistant', content: reply });
        steps.push({ user: turn, reply, state });
      }
      return { reply, state, steps };
    }

    const sinkPhone = '(214) 555-0190';
    const sinkOpening = 'My kitchen sink is clogged and water is backing up.';
    const emergencyPitch = `We offer 24/7 emergency service. You can call us at ${sinkPhone} anytime.`;
    const propertyQuestion = 'Is the property residential or commercial?';
    const scopeQuestion = 'Do you need a repair or a replacement?';
    const dogsQuestion = 'Do you have dogs at the property?';
    const sinkBusiness = createBusinessProfile({
      ...business,
      website: 'https://sink-emergency.test',
      businessName: 'Field Service',
      phone: sinkPhone,
      services: ['On-site equipment service'],
      leadQuestions: [propertyQuestion, scopeQuestion, dogsQuestion],
      leadNotificationEmail: 'alerts@example.test',
    });
    globalThis.fetch = checkerFails;
    const sink = await walk(sinkBusiness, [
      sinkOpening,
      'Alex',
      '5125550198',
      '400 Main St, Dallas TX 75201',
      'The second one.',
    ]);
    assert(sink.steps[0].reply.includes(PRE_CONTACT_ASK_FIRST_NAME), `sink opening must ask for the name, got ${sink.steps[0].reply}`);
    assert(!sink.steps[0].reply.includes(sinkPhone), 'sink opening must not expose the business phone without an emergency');
    assert(!/residential or commercial|preferred time|what day|what time/i.test(sink.steps[0].reply), `sink opening must not discover or ask timing, got ${sink.steps[0].reply}`);
    assert(!validateSalesReply(emergencyPitch, sink.steps[0].state, sinkBusiness, sinkOpening).ok, 'emergency service pitch must fail before the lead is secured');
    assert.equal(sink.steps[0].state.leadDeliveryStatus, 'NOT_SENT');
    assert(sink.steps[1].reply.includes(PRE_CONTACT_ASK_PHONE), `sink name turn must ask for the phone, got ${sink.steps[1].reply}`);
    assert(!sink.steps[1].reply.includes(sinkPhone));
    assert(sink.steps[2].reply.includes(PRE_CONTACT_ASK_ADDRESS), `sink phone turn must ask for the address, got ${sink.steps[2].reply}`);
    assert.equal(sink.steps[3].reply, propertyQuestion, `address turn must ask the first owner question, got ${sink.steps[3].reply}`);
    assert.equal(sink.steps[3].state.lead.name, 'Alex');
    assert((sink.steps[3].state.lead.phone || '').replace(/\D/g, '').includes('5125550198'));
    assert(/400 Main St/i.test(sink.steps[3].state.lead.address || ''));
    assert.equal(sink.steps[4].state.ownerQuestionAnswers[propertyQuestion], 'commercial', 'ordinal either/or must select the second option during checker failure');
    assert.equal(sink.steps[4].reply, scopeQuestion, `answered property question must advance, got ${sink.steps[4].reply}`);
    assert.equal(sink.steps[4].state.lead.name, 'Alex');
    assert.equal(sink.steps[4].state.leadDeliveryStatus, 'NOT_SENT');
    assert(!evaluateHandoffReadiness(sink.steps[4].state).handoffReady);
    assert.equal(sinkBusiness.pricingRules, business.pricingRules);
    assert.equal(sinkBusiness.systemPrompt, business.systemPrompt);

    const emergencyOpening = `${sinkOpening} This is an emergency.`;
    const emergency = await walk(sinkBusiness, [emergencyOpening]);
    assert(emergency.reply.includes(PRE_CONTACT_ASK_FIRST_NAME), `emergency opening must still collect the name, got ${emergency.reply}`);
    assert(emergency.reply.includes(sinkPhone), 'an explicit emergency may include the business phone');
    assert(!/residential or commercial/i.test(emergency.reply));
    assert.equal(emergency.state.leadDeliveryStatus, 'NOT_SENT');
    assert(!emergency.state.lead.name);

    const emergencyQuestion = "Is this an emergency?";
    const emergencyAnswer = "This is an emergency.";
    const emergencyBusiness = createBusinessProfile({
      ...sinkBusiness,
      website: "https://emergency-question.test",
      leadQuestions: [emergencyQuestion, dogsQuestion],
    });
    const emergencyConversation = await walk(emergencyBusiness, [
      sinkOpening,
      "Alex",
      "5125550198",
      "400 Main St, Dallas TX 75201",
      emergencyAnswer,
    ]);
    assert.equal(emergencyConversation.steps[3].reply, emergencyQuestion, `address turn must ask the emergency question, got ${emergencyConversation.steps[3].reply}`);
    const emergencyFollowUp = emergencyConversation.steps[4];
    const emergencyRecorded = emergencyFollowUp.state.ownerQuestionAnswers[emergencyQuestion] === emergencyAnswer;
    const emergencyClarified = /\?/.test(emergencyFollowUp.reply) && !/is this an emergency/i.test(emergencyFollowUp.reply);
    assert(emergencyRecorded || emergencyClarified, `emergency reply must be recorded or clarified, got ${emergencyFollowUp.reply}`);
    assert(!emergencyFollowUp.reply.includes(emergencyQuestion), `must not repeat the emergency question, got ${emergencyFollowUp.reply}`);
    assert.equal(emergencyFollowUp.state.lead.name, "Alex");
    assert((emergencyFollowUp.state.lead.phone || "").replace(/\D/g, "").includes("5125550198"));
    assert(/400 Main St/i.test(emergencyFollowUp.state.lead.address || ""));
    assert.equal(emergencyFollowUp.state.leadDeliveryStatus, "NOT_SENT");
    assert(!evaluateHandoffReadiness(emergencyFollowUp.state).handoffReady);
    if (emergencyRecorded) assert.equal(emergencyFollowUp.reply, dogsQuestion);

    const checkerFalse = (async () => new Response(JSON.stringify({ id: 'resp_check', object: 'response', output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: '{"answersQuestion":false}', annotations: [] }] }] }), { status: 200, headers: { 'Content-Type': 'application/json' } })) as typeof fetch;
    process.env.OPENAI_API_KEY = 'test-only';
    const emergencyChecked = await walk(emergencyBusiness, [
      sinkOpening,
      'Alex',
      '5125550198',
      '400 Main St, Dallas TX 75201',
      emergencyAnswer,
    ], checkerFalse);
    assert.equal(emergencyChecked.state.ownerQuestionAnswers[emergencyQuestion], emergencyAnswer, 'exact emergency reply must be stored when the checker returns false');
    assert.equal(emergencyChecked.reply, dogsQuestion);
    assert(!emergencyChecked.reply.includes(emergencyQuestion));
    assert.equal(emergencyChecked.state.lead.name, 'Alex');
    assert((emergencyChecked.state.lead.phone || '').replace(/\D/g, '').includes('5125550198'));
    assert(/400 Main St/i.test(emergencyChecked.state.lead.address || ''));
    assert.equal(emergencyChecked.state.leadDeliveryStatus, 'NOT_SENT');
    assert(!evaluateHandoffReadiness(emergencyChecked.state).handoffReady);
    const emergencyUncertain = await walk(emergencyBusiness, [
      sinkOpening,
      'Alex',
      '5125550198',
      '400 Main St, Dallas TX 75201',
      "I'm not sure if this is an emergency.",
    ], checkerFails);
    assert.equal(emergencyUncertain.state.ownerQuestionAnswers[emergencyQuestion], undefined);
    assert.equal(emergencyUncertain.reply, ownerQuestionClarification(emergencyQuestion));
    assert(!emergencyUncertain.reply.includes(emergencyQuestion));
    assert.equal(emergencyUncertain.state.lead.name, 'Alex');
    assert((emergencyUncertain.state.lead.phone || '').replace(/\D/g, '').includes('5125550198'));
    assert(/400 Main St/i.test(emergencyUncertain.state.lead.address || ''));
    assert.equal(emergencyUncertain.state.leadDeliveryStatus, 'NOT_SENT');
    assert(!evaluateHandoffReadiness(emergencyUncertain.state).handoffReady);

    process.env.OPENAI_API_KEY = 'test-only';
    const pair1Question = 'Is this an emergency that needs immediate attention, or can we schedule a convenient time for a service visit?';
    const pair1Customer = "yes. My kitchen sink is clogged and I can't use it.";
    const pair1Business = createBusinessProfile({
      ...sinkBusiness,
      website: 'https://pair1-emergency-schedule.test',
      leadQuestions: [pair1Question, dogsQuestion],
      systemPrompt: business.systemPrompt,
      faqs: [],
    });
    const pair1 = await walk(pair1Business, [
      sinkOpening,
      'Alex',
      '5125550198',
      '400 Main St, Dallas TX 75201',
      pair1Customer,
    ], checkerFails);
    assert.equal(pair1.steps[3].reply, pair1Question, `address turn must ask the exact emergency scheduling question, got ${pair1.steps[3].reply}`);
    const pair1Stored = pair1.state.ownerQuestionAnswers[pair1Question];
    const pair1Clarified = !pair1.reply.includes(pair1Question) && /\?/.test(pair1.reply);
    assert(pair1Stored || pair1Clarified, `pair 1 must record a supported answer or ask a specific clarification, got ${pair1.reply}`);
    assert(!pair1.reply.includes(pair1Question), `pair 1 must not repeat the original question, got ${pair1.reply}`);
    assert.equal(pair1.state.lead.name, 'Alex');
    assert((pair1.state.lead.phone || '').replace(/\D/g, '').includes('5125550198'));
    assert(/400 Main St/i.test(pair1.state.lead.address || ''));
    assert.equal(pair1.state.leadDeliveryStatus, 'NOT_SENT');
    assert(!evaluateHandoffReadiness(pair1.state).handoffReady);
    assert.equal(pair1.state.ownerQuestionAnswers[dogsQuestion], undefined);
    assert.equal(pair1.state.ownerQuestionAnswers[pair1Question], undefined, 'ambiguous yes must not select an either/or alternative by phrase length');
    assert.equal(pair1.reply, ownerQuestionClarification(pair1Question));
    const ambiguousYes = await walk(pair1Business, [
      sinkOpening,
      'Alex',
      '5125550198',
      '400 Main St, Dallas TX 75201',
      'Yes.',
    ], checkerFails);
    assert.equal(ambiguousYes.state.ownerQuestionAnswers[pair1Question], undefined, 'bare yes must not select the longer either/or alternative');
    assert.equal(ambiguousYes.reply, ownerQuestionClarification(pair1Question));
    assert(!ambiguousYes.reply.includes(pair1Question));
    assert.equal(ambiguousYes.state.lead.name, 'Alex');
    assert((ambiguousYes.state.lead.phone || '').replace(/\D/g, '').includes('5125550198'));
    assert(/400 Main St/i.test(ambiguousYes.state.lead.address || ''));
    assert.equal(ambiguousYes.state.leadDeliveryStatus, 'NOT_SENT');
    assert(!evaluateHandoffReadiness(ambiguousYes.state).handoffReady);

    const pair2Question = 'Do you have dogs at the property?';
    const pair2Customer = 'No. Is your property insured?';
    const parkingQuestion = 'Is there a parking restriction?';
    const pair2Business = createBusinessProfile({
      ...business,
      website: 'https://pair2-dogs-insurance.test',
      businessName: 'Field Service',
      phone: sinkPhone,
      services: ['On-site equipment service'],
      leadQuestions: [pair2Question, parkingQuestion],
      leadNotificationEmail: 'alerts@example.test',
      systemPrompt: 'Use protective covers inside the property.',
      faqs: [],
    });
    const pair2 = await walk(pair2Business, [
      sinkOpening,
      'Alex',
      '5125550198',
      '400 Main St, Dallas TX 75201',
      pair2Customer,
    ], checkerFails);
    assert.equal(pair2.steps[3].reply, pair2Question);
    assert(/^no\.?$/i.test(pair2.state.ownerQuestionAnswers[pair2Question] || ''), `pair 2 must retain No, got ${pair2.state.ownerQuestionAnswers[pair2Question]}`);
    assert(/insur/i.test(pair2.reply), `pair 2 must address insurance, got ${pair2.reply}`);
    assert(/don'?t have|do not have|not sure|cannot confirm|can'?t confirm|no information/i.test(pair2.reply), `absent insurance facts must be acknowledged, got ${pair2.reply}`);
    assert(!/\b(?:we are|we're|yes,?\s+we are)\s+insured\b/i.test(pair2.reply), `must not invent insurance, got ${pair2.reply}`);
    assert(!pair2.reply.includes(pair2Question), `pair 2 must not repeat the dogs question, got ${pair2.reply}`);
    assert.equal(pair2.state.ownerQuestionAnswers[parkingQuestion], undefined);
    assert.equal(pair2.state.lead.name, 'Alex');
    assert((pair2.state.lead.phone || '').replace(/\D/g, '').includes('5125550198'));
    assert(/400 Main St/i.test(pair2.state.lead.address || ''));
    assert.equal(pair2.state.leadDeliveryStatus, 'NOT_SENT');
    assert(!evaluateHandoffReadiness(pair2.state).handoffReady);
    const insuredBusiness = createBusinessProfile({
      ...pair2Business,
      website: 'https://pair2-insured.test',
      faqs: [{ question: 'Do you have insurance?', answer: 'Yes, the business carries liability insurance.' }],
    });
    const pair2Insured = await walk(insuredBusiness, [
      sinkOpening,
      'Alex',
      '5125550198',
      '400 Main St, Dallas TX 75201',
      pair2Customer,
    ], checkerFails);
    assert(/^no\.?$/i.test(pair2Insured.state.ownerQuestionAnswers[pair2Question] || ''));
    assert(/liability insurance/i.test(pair2Insured.reply), `insurance facts must be used, got ${pair2Insured.reply}`);
    assert(!/don'?t have information/i.test(pair2Insured.reply));
    assert.equal(pair2Insured.state.leadDeliveryStatus, 'NOT_SENT');
    assert(!evaluateHandoffReadiness(pair2Insured.state).handoffReady);
    const shortFaqQuestion = 'Do you have insurance?';
    const shortFaqBusiness = createBusinessProfile({
      ...pair2Business,
      website: 'https://pair2-short-faq.test',
      faqs: [{ question: shortFaqQuestion, answer: 'Yes.' }],
    });
    const shortFaq = await walk(shortFaqBusiness, [
      sinkOpening,
      'Alex',
      '5125550198',
      '400 Main St, Dallas TX 75201',
      pair2Customer,
    ], checkerFails);
    assert(/^no\.?$/i.test(shortFaq.state.ownerQuestionAnswers[pair2Question] || ''));
    assert(shortFaq.reply.includes('Yes.'), `a short FAQ answer must be used, got ${shortFaq.reply}`);
    assert(!shortFaq.reply.includes(shortFaqQuestion), `an FAQ question must not be returned as the fact, got ${shortFaq.reply}`);
    assert(!/don'?t have information/i.test(shortFaq.reply));
    assert(shortFaq.reply.includes(parkingQuestion));
    assert.equal(shortFaq.state.ownerQuestionAnswers[parkingQuestion], undefined);
    assert.equal(shortFaq.state.lead.name, 'Alex');
    assert((shortFaq.state.lead.phone || '').replace(/\D/g, '').includes('5125550198'));
    assert(/400 Main St/i.test(shortFaq.state.lead.address || ''));
    assert.equal(shortFaq.state.leadDeliveryStatus, 'NOT_SENT');
    assert(!evaluateHandoffReadiness(shortFaq.state).handoffReady);

    const negativeBusiness = createBusinessProfile({
      ...pair2Business,
      website: 'https://compound-negative.test',
    });
    for (const negativeReply of ['No, we don\'t.', 'No; we do not.', 'No — we don\'t.', 'No: we don\'t.', 'We don\u2019t have dogs.']) {
      const negative = await walk(negativeBusiness, [
        sinkOpening,
        'Alex',
        '5125550198',
        '400 Main St, Dallas TX 75201',
        negativeReply,
      ], checkerFails);
      assert.equal(negative.steps[3].reply, pair2Question);
      const storedNegative = negative.state.ownerQuestionAnswers[pair2Question] || '';
      assert(/no|not|n['\u2019]t/i.test(storedNegative), `compound negative must survive punctuation, got ${storedNegative} from ${negativeReply}`);
      assert.equal(negative.reply, parkingQuestion, `compound negative must advance, got ${negative.reply} from ${negativeReply}`);
      assert(!negative.reply.includes(pair2Question));
      assert.equal(negative.state.ownerQuestionAnswers[parkingQuestion], undefined);
      assert.equal(negative.state.lead.name, 'Alex');
      assert((negative.state.lead.phone || '').replace(/\D/g, '').includes('5125550198'));
      assert(/400 Main St/i.test(negative.state.lead.address || ''));
      assert.equal(negative.state.leadDeliveryStatus, 'NOT_SENT');
      assert(!evaluateHandoffReadiness(negative.state).handoffReady);
    }

    const sharedKeyword = await walk(pair2Business, [
      sinkOpening,
      'Alex',
      '5125550198',
      '400 Main St, Dallas TX 75201',
      'No. Do you use protective covers on the driveway?',
    ], checkerFails);
    assert(/^no\.?$/i.test(sharedKeyword.state.ownerQuestionAnswers[pair2Question] || ''));
    assert(!/inside the property/i.test(sharedKeyword.reply), `a shared keyword must not answer a different question, got ${sharedKeyword.reply}`);
    assert(/don'?t have information/i.test(sharedKeyword.reply), `an unmatched complete question must stay uncertain, got ${sharedKeyword.reply}`);
    assert(sharedKeyword.reply.includes(parkingQuestion));
    assert.equal(sharedKeyword.state.leadDeliveryStatus, 'NOT_SENT');
    assert(!evaluateHandoffReadiness(sharedKeyword.state).handoffReady);
    const partialInsurance = await walk(insuredBusiness, [
      sinkOpening,
      'Alex',
      '5125550198',
      '400 Main St, Dallas TX 75201',
      'No. Is the parking area insured against flood damage?',
    ], checkerFails);
    assert(/^no\.?$/i.test(partialInsurance.state.ownerQuestionAnswers[pair2Question] || ''));
    assert(!/liability insurance/i.test(partialInsurance.reply), `insurance wording must not answer a different insurance question, got ${partialInsurance.reply}`);
    assert(/don'?t have information/i.test(partialInsurance.reply));
    assert(partialInsurance.reply.includes(parkingQuestion));
    assert.equal(partialInsurance.state.leadDeliveryStatus, 'NOT_SENT');
    assert(!evaluateHandoffReadiness(partialInsurance.state).handoffReady);

    process.env.OPENAI_API_KEY = 'test-only';
    const emergencyCompound = await walk(emergencyBusiness, [
      sinkOpening,
      'Alex',
      '5125550198',
      '400 Main St, Dallas TX 75201',
      `I'm not sure about the parking. ${emergencyAnswer}`,
    ], checkerFails);
    assert.equal(emergencyCompound.state.ownerQuestionAnswers[emergencyQuestion], emergencyAnswer, 'a clear emergency answer must survive inside a compound reply when the checker fails');
    assert.equal(emergencyCompound.reply, dogsQuestion);
    assert(!emergencyCompound.reply.includes(emergencyQuestion), `compound emergency reply must not repeat the original question, got ${emergencyCompound.reply}`);
    assert.equal(emergencyCompound.state.lead.name, 'Alex');
    assert((emergencyCompound.state.lead.phone || '').replace(/\D/g, '').includes('5125550198'));
    assert(/400 Main St/i.test(emergencyCompound.state.lead.address || ''));
    assert.equal(emergencyCompound.state.leadDeliveryStatus, 'NOT_SENT');
    assert(!evaluateHandoffReadiness(emergencyCompound.state).handoffReady);

    const outOfRange = await walk(sinkBusiness, [
      sinkOpening,
      'Alex',
      '5125550198',
      '400 Main St, Dallas TX 75201',
      'The third one.',
    ], checkerFails);
    assert.equal(outOfRange.state.ownerQuestionAnswers[propertyQuestion], undefined, 'an ordinal past the last option must not select one');
    assert.equal(outOfRange.reply, ownerQuestionClarification(propertyQuestion));
    assert(!outOfRange.reply.includes(propertyQuestion), `out-of-range ordinal must not repeat the original question, got ${outOfRange.reply}`);
    assert.equal(outOfRange.state.lead.name, 'Alex');
    assert((outOfRange.state.lead.phone || '').replace(/\D/g, '').includes('5125550198'));
    assert(/400 Main St/i.test(outOfRange.state.lead.address || ''));
    assert.equal(outOfRange.state.leadDeliveryStatus, 'NOT_SENT');
    assert(!evaluateHandoffReadiness(outOfRange.state).handoffReady);

    const scheduleQuestion = 'Do you need emergency service today or scheduled service tomorrow?';
    const scheduleBusiness = createBusinessProfile({
      ...sinkBusiness,
      website: 'https://sentence-alternative.test',
      leadQuestions: [scheduleQuestion, dogsQuestion],
    });
    const scheduleReply = 'We need scheduled service tomorrow.';
    const schedule = await walk(scheduleBusiness, [
      sinkOpening,
      'Alex',
      '5125550198',
      '400 Main St, Dallas TX 75201',
      scheduleReply,
    ], checkerFails);
    assert.equal(schedule.state.ownerQuestionAnswers[scheduleQuestion], 'scheduled service tomorrow', 'a sentence-length alternative must be stored when the checker fails');
    assert.equal(schedule.reply, dogsQuestion);
    assert(!schedule.reply.includes(scheduleQuestion), `sentence-length answer must not repeat the original question, got ${schedule.reply}`);
    assert.equal(schedule.state.lead.name, 'Alex');
    assert((schedule.state.lead.phone || '').replace(/\D/g, '').includes('5125550198'));
    assert(/400 Main St/i.test(schedule.state.lead.address || ''));
    assert.equal(schedule.state.leadDeliveryStatus, 'NOT_SENT');
    assert(!evaluateHandoffReadiness(schedule.state).handoffReady);
    const scheduleOrdinal = await walk(scheduleBusiness, [
      sinkOpening,
      'Alex',
      '5125550198',
      '400 Main St, Dallas TX 75201',
      'The second one.',
    ], checkerFails);
    assert.equal(scheduleOrdinal.state.ownerQuestionAnswers[scheduleQuestion], 'scheduled service tomorrow');
    assert.equal(scheduleOrdinal.reply, dogsQuestion);
    assert(!scheduleOrdinal.reply.includes(scheduleQuestion));
    assert.equal(scheduleOrdinal.state.leadDeliveryStatus, 'NOT_SENT');

    const optionQuestion = await walk(sinkBusiness, [
      sinkOpening,
      'Alex',
      '5125550198',
      '400 Main St, Dallas TX 75201',
      'Is commercial the right choice?',
    ], checkerRejects);
    assert.equal(optionQuestion.state.ownerQuestionAnswers[propertyQuestion], undefined, 'mentioning an option inside a question must not select it');
    assert.equal(optionQuestion.reply, ownerQuestionClarification(propertyQuestion));
    assert(!optionQuestion.reply.includes(propertyQuestion));
    assert.equal(optionQuestion.state.lead.name, 'Alex');
    assert((optionQuestion.state.lead.phone || '').replace(/\D/g, '').includes('5125550198'));
    assert(/400 Main St/i.test(optionQuestion.state.lead.address || ''));
    assert.equal(optionQuestion.state.leadDeliveryStatus, 'NOT_SENT');
    assert(!evaluateHandoffReadiness(optionQuestion.state).handoffReady);

    const optionUncertain = await walk(sinkBusiness, [
      sinkOpening,
      'Alex',
      '5125550198',
      '400 Main St, Dallas TX 75201',
      "Maybe commercial, I'm not sure.",
    ], checkerRejects);
    assert.equal(optionUncertain.state.ownerQuestionAnswers[propertyQuestion], undefined, 'an uncertain mention must not select an option');
    assert.equal(optionUncertain.reply, ownerQuestionClarification(propertyQuestion));
    assert(!optionUncertain.reply.includes(propertyQuestion));
    assert.equal(optionUncertain.state.lead.name, 'Alex');
    assert((optionUncertain.state.lead.phone || '').replace(/\D/g, '').includes('5125550198'));
    assert(/400 Main St/i.test(optionUncertain.state.lead.address || ''));
    assert.equal(optionUncertain.state.leadDeliveryStatus, 'NOT_SENT');
    assert(!evaluateHandoffReadiness(optionUncertain.state).handoffReady);

    const compound = await walk(sinkBusiness, [
      sinkOpening,
      'Alex',
      '5125550198',
      '400 Main St, Dallas TX 75201',
      "It's commercial, not residential, and we need a replacement rather than a repair.",
    ]);
    assert.equal(compound.state.ownerQuestionAnswers[propertyQuestion], 'commercial');
    assert.equal(compound.state.ownerQuestionAnswers[scopeQuestion], 'replacement');
    assert.equal(compound.reply, dogsQuestion, `compound answers must advance to the remaining question, got ${compound.reply}`);
    assert(!compound.reply.includes(propertyQuestion));
    assert(!compound.reply.includes(scopeQuestion));
    assert.equal(compound.state.leadDeliveryStatus, 'NOT_SENT');
    assert.equal(compound.state.lead.name, 'Alex');
    assert(/400 Main St/i.test(compound.state.lead.address || ''));

    globalThis.fetch = checkerRejects;
    const ambiguous = await walk(sinkBusiness, [
      sinkOpening,
      'Alex',
      '5125550198',
      '400 Main St, Dallas TX 75201',
      'Residential or commercial, not sure.',
    ]);
    assert.equal(ambiguous.state.ownerQuestionAnswers[propertyQuestion], undefined, 'both options with no choice must stay unanswered when the checker accepts them');
    assert.equal(ambiguous.reply, ownerQuestionClarification(propertyQuestion));
    assert(!ambiguous.reply.includes(propertyQuestion));
    const phoneOnly = await walk(sinkBusiness, [
      sinkOpening,
      'Alex',
      '5125550198',
      '400 Main St, Dallas TX 75201',
      '214-555-0148',
    ]);
    assert.equal(phoneOnly.state.ownerQuestionAnswers[propertyQuestion], undefined, 'a phone-only reply must not answer the owner question');
    assert.equal(phoneOnly.state.lead.phone?.replace(/\D/g, '').includes('5125550198'), true);
    assert.equal(phoneOnly.reply, propertyQuestion);
    delete process.env.OPENAI_API_KEY;
    const priceOnly = await walk(sinkBusiness, [
      sinkOpening,
      'Alex',
      '5125550198',
      '400 Main St, Dallas TX 75201',
      'How much will it cost?',
    ]);
    assert.equal(priceOnly.state.ownerQuestionAnswers[propertyQuestion], undefined);
    assert(priceOnly.reply.includes(propertyQuestion), `a bare price question must still leave the owner question, got ${priceOnly.reply}`);
    assert(/not the total|depends/i.test(priceOnly.reply));

    const descriptionQuestion = 'Can you describe the electrical problem or project you need help with?';
    const chargerReply = 'I want to install a car charger in my garage I bought a new electric car';
    const chargerBusiness = createBusinessProfile({
      ...business,
      website: 'https://charger-description.test',
      businessName: 'Field Service',
      phone: sinkPhone,
      services: ['Equipment installation'],
      leadQuestions: [descriptionQuestion, dogsQuestion],
      leadNotificationEmail: 'alerts@example.test',
    });
    const charger = await walk(chargerBusiness, [
      'Install a charger in my garage',
      'Jamie',
      '2145550199',
      '100 Main St, Dallas TX 75201',
      chargerReply,
    ]);
    assert(charger.steps[0].reply.includes(PRE_CONTACT_ASK_FIRST_NAME), `charger opening must ask for the name, got ${charger.steps[0].reply}`);
    assert(!charger.steps[0].reply.includes(descriptionQuestion));
    assert(!charger.steps[0].reply.includes(sinkPhone));
    assert(charger.steps[1].reply.includes(PRE_CONTACT_ASK_PHONE));
    assert(charger.steps[2].reply.includes(PRE_CONTACT_ASK_ADDRESS));
    assert.equal(charger.steps[3].reply, descriptionQuestion, `charger address turn must ask the description question, got ${charger.steps[3].reply}`);
    assert.equal(charger.steps[3].state.lead.name, 'Jamie');
    assert((charger.steps[3].state.lead.phone || '').replace(/\D/g, '').includes('2145550199'));
    assert(/100 Main St/i.test(charger.steps[3].state.lead.address || ''));
    assert.equal(charger.steps[4].state.ownerQuestionAnswers[descriptionQuestion], chargerReply, 'exact charger description must persist during checker failure');
    assert.equal(charger.steps[4].reply, dogsQuestion, `answered description must advance, got ${charger.steps[4].reply}`);
    assert(!charger.steps[4].reply.includes(descriptionQuestion));
    assert.equal(charger.steps[4].state.leadDeliveryStatus, 'NOT_SENT');
    assert(!evaluateHandoffReadiness(charger.steps[4].state).handoffReady);
    assert.equal(chargerBusiness.pricingRules, business.pricingRules);
    const chargerPrice = buildIntentAwarePriceAnswer(charger.state, chargerBusiness, 'What is the overall cost?');
    assert(chargerPrice.includes('$20') && /not the total/.test(chargerPrice));

    process.env.OPENAI_API_KEY = 'test-only';
    globalThis.fetch = checkerFails;
    const chargerChecked = await walk(chargerBusiness, [
      'Install a charger in my garage',
      'Jamie',
      '2145550199',
      '100 Main St, Dallas TX 75201',
      chargerReply,
    ]);
    assert.equal(chargerChecked.state.ownerQuestionAnswers[descriptionQuestion], chargerReply);
    assert.equal(chargerChecked.reply, dogsQuestion);
    assert.equal(chargerChecked.state.leadDeliveryStatus, 'NOT_SENT');

    console.log('PASS — sink/emergency and charger-description conversations, either/or selection, checker rejection');
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
