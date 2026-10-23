import assert from "node:assert/strict";
import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import SimplePeterChat from "../src/components/BusinessChat/SimplePeterChat";
import SimpleCustomerChat from "../src/components/BusinessChat/SimpleCustomerChat";
import {createBusinessProfile} from "../src/lib/businessProfile";
import {businessInstructions,submissionState,generateBusinessReply,leadClosing} from "../src/lib/businessChat/engine";
import {currentConversation,parseMessages} from "../src/lib/businessChat/policy";
import {POST as chat} from "../src/app/api/business-chat/route";
import {POST as inbox} from "../src/app/api/business-chat/inbox/route";
import {POST as upload} from "../src/app/api/business-chat/media/route";
import {validatePhoto,readPhoto} from "../src/lib/businessChat/media";
import {saveLead,validBusinessId} from "../src/lib/businessChat/store";
import {maybeSendLeadHandoff,setLeadHandoffTestDelivery,scheduleLeadAlertDelivery} from "../src/lib/leadHandoff";

async function main(){
 process.env.NEXT_PUBLIC_SUPABASE_URL="https://database.test";process.env.SUPABASE_SERVICE_ROLE_KEY="test-only-service-key";process.env.OPENAI_API_KEY="test-only-ai-key";process.env.BUSINESS_CHAT_MODEL="test-model";
 const business=createBusinessProfile({website:"https://plumbing.test",businessName:"Test Plumbing",services:["Residential plumbing"],ownerLeadQuestions:[],leadQuestions:["Website discovery question?"],pricingRules:"$20 visit fee, waived if proceeding.",leadNotificationEmail:"owner@example.test",leadNotificationPhone:"+12145550199"});
 const peterMarkup=renderToStaticMarkup(createElement(SimplePeterChat,{business,demoId:"qa-plumbing"}));
 assert(peterMarkup.includes("Message Peter"));assert(!/type="password"|Business name|Open business|Start test/.test(peterMarkup));
 const deniedInbox=await inbox(new Request("https://site.test/api/business-chat/inbox",{method:"POST",body:JSON.stringify({demoId:"qa-plumbing"})}));assert(deniedInbox.status>=400,"Inbox must fail closed without an authenticated owner session");
 const freshMarkup=renderToStaticMarkup(createElement(SimplePeterChat,{business:{...business,leadNotificationEmail:undefined,leadNotificationPhone:undefined},demoId:"qa-fresh"}));assert(freshMarkup.includes("Where should we send new lead alerts?"));assert(!freshMarkup.includes('type="password"'));assert(!peterMarkup.includes("Where should we send new lead alerts?"),"Saved recipients must not be requested again");
 const customerMarkup=renderToStaticMarkup(createElement(SimpleCustomerChat,{business,demoId:"qa-plumbing",disabled:false}));assert(customerMarkup.includes("Attach photo"));assert(customerMarkup.includes('autoComplete="off"'));
 const instructions=businessInstructions(business);assert(instructions.includes("$20 visit fee"));assert(!instructions.includes("Website discovery question?"));assert(instructions.includes("Do not diagnose"));
 const conversationId="12345678-1234-4234-8234-123456789abc";
 const messages=parseMessages([{role:"user",content:"My sink is clogged. I am Sam, phone 2145550101, address 1500 Marilla St, Dallas TX 75201. Please come today anytime."}]);
 const payload={name:"Sam",phone:"2145550101",address:"1500 Marilla St, Dallas TX 75201",serviceNeed:"My sink is clogged",preferredTime:"today anytime",notes:"",ownerAnswers:[]};
 const parsed=submissionState(business,conversationId,payload,messages);assert(parsed.state);assert.equal(parsed.state.preferredTiming,"today anytime");
 assert.throws(()=>submissionState(business,conversationId,{...payload,name:"Invented"},messages));
 const mandatory={...business,ownerLeadQuestions:["Do you have pets?"],leadQuestions:["Do you have pets?"]};assert.equal(submissionState(mandatory,conversationId,payload,messages).missing,"Do you have pets?");
 const answered=parseMessages([...messages,{role:"assistant",content:"Do you have pets?",version:"v1"},{role:"user",content:"No. Is there a visiting fee?"}]);
 assert(submissionState(mandatory,conversationId,{...payload,ownerAnswers:[{question:"Do you have pets?",answer:"No"}]},answered).state);
 assert.throws(()=>submissionState(mandatory,conversationId,{...payload,ownerAnswers:[{question:"Do you have pets?",answer:"I have a dog"}]},answered));
 const old=currentConversation(parseMessages([{role:"user",content:"Price?"},{role:"assistant",content:"Old fee $100",version:"old"},{role:"user",content:"What about now?"}]),"new");assert.equal(old.length,2);assert(!JSON.stringify(old).includes("$100"));
 assert.throws(()=>validBusinessId("saleslab-123"));assert.throws(()=>validBusinessId("bad?query"));
 assert.throws(()=>validatePhoto(new Uint8Array([1,2,3]),"image/png"));assert.throws(()=>validatePhoto(new Uint8Array(3*1024*1024),"image/png"));
 let record={id:"qa-plumbing",profile:business,updated_at:"v1"};let lead:any=null,failSave=false,aiText="Yes, we can help. May I have your name?",tool:any=null,changeDuringAI=false,modelCalls=0,sawImage=false,sawSubmitted=false,leadWrites=0;
 const photoRows:Record<string,any>={};const original=globalThis.fetch;
 globalThis.fetch=async(input,init)=>{
  const url=String(input instanceof Request?input.url:input);
  if(url.includes("database.test/rest/v1/business_profiles")){
   const params=new URL(url).searchParams,id=params.get("id")?.slice(3);
   if(id?.startsWith("businesschat-photo-"))return Response.json(photoRows[id]?[photoRows[id]]:[]);
   if(id?.startsWith("businesschat-lead-"))return Response.json(lead?[lead]:[]);
   if(url.includes("kind=eq.business-chat-photo-v1"))return Response.json(Object.values(photoRows).map(r=>({id:r.id,...r.profile})));
   if(init?.method==="POST"){
    const row=JSON.parse(String(init.body));if(row.profile.kind==="business-chat-photo-v1"){photoRows[row.id]=row;return Response.json([row]);}
    if(failSave)return Response.json({},{status:500});if(lead)return Response.json([]);lead=row;leadWrites++;return Response.json([row]);
   }
   return Response.json(id===record.id?[record]:[]);
  }
  if(url.includes("api.openai.com")){
   modelCalls++;const body=JSON.parse(String(init?.body));sawImage=JSON.stringify(body.input).includes('"input_image"');sawSubmitted=body.tools.length===0&&body.instructions.includes("Do not ask questions");
   assert(body.instructions.includes(record.profile.pricingRules));assert(!body.instructions.includes("test-only-service-key"));if(changeDuringAI)record={...record,updated_at:"v2"};
   return Response.json({id:"resp_test",object:"response",status:"completed",output:tool?[{type:"function_call",name:"submit_lead",call_id:"call_test",arguments:JSON.stringify(tool)}]:[{type:"message",role:"assistant",content:[{type:"output_text",text:aiText,annotations:[]}]}]});
  }
  throw new Error("Unexpected URL "+url);
 };
 const request=(extra:Record<string,unknown>={})=>new Request("https://site.test/api/business-chat",{method:"POST",body:JSON.stringify({demoId:record.id,conversationId,messages,...extra})});
 try{
  let response=await chat(request());assert.equal(response.status,200);assert.equal((await response.json()).closed,false);
  aiText="Call 2145550190";response=await chat(request());assert.equal(response.status,502);aiText="I have sent your details to the team.";assert.equal((await chat(request())).status,502);
  aiText="Yes, we can help.";changeDuringAI=true;assert.equal((await chat(request())).status,409);changeDuringAI=false;
  const bytes=new Uint8Array([137,80,78,71,13,10,26,10,0]);const form=new FormData();form.set("demoId",record.id);form.set("conversationId",conversationId);form.set("photo",new File([bytes],"sink.png",{type:"image/png"}));
  const uploadResponse=await upload(new Request("https://site.test/api/business-chat/media",{method:"POST",body:form}));assert.equal(uploadResponse.status,200);const photo=await uploadResponse.json();
  await assert.rejects(()=>readPhoto("another-business",photo.id,conversationId));await assert.rejects(()=>readPhoto(record.id,photo.id,"87654321-1234-4234-8234-123456789abc"));
  response=await chat(request({messages:[{...messages[0],photoIds:[photo.id]}]}));assert.equal(response.status,200);assert(sawImage);
  tool=payload;failSave=true;response=await chat(request());assert.equal(response.status,503);assert(!JSON.stringify(await response.json()).includes(leadClosing));failSave=false;
  process.env.LEAD_HANDOFF_DRY_RUN="1";response=await chat(request());assert.equal(response.status,200);assert.equal((await response.json()).reply,leadClosing);assert.equal(leadWrites,1);
  const callsBefore=modelCalls;tool=null;aiText="That's outside our scope. We specialize in plumbing.";response=await chat(request({messages:[...messages,{role:"assistant",content:leadClosing,version:record.updated_at},{role:"user",content:"How do I fix an electrical panel?"}]}));assert.equal(response.status,200);assert(sawSubmitted);assert.equal(modelCalls,callsBefore+1);assert.equal(leadWrites,1);
  assert.equal(await saveLead({id:record.id,profile:business,updatedAt:record.updated_at},conversationId,payload,"QUEUED"),false);
  delete process.env.LEAD_HANDOFF_DRY_RUN;
  let deliveries=0;setLeadHandoffTestDelivery(async details=>{deliveries++;assert.equal(details.emailTo,"owner@example.test");assert.equal(details.smsTo,"+12145550199");assert(details.text.includes("today anytime"));return {emailOk:true,smsOk:true};});
  const result=await maybeSendLeadHandoff(business,parsed.state!,"closure");assert.equal(result.status,"QUEUED");assert.equal(deliveries,0);let background:(()=>void|Promise<void>)|undefined;scheduleLeadAlertDelivery(task=>{background=task;},result.delivery);assert(background);await background();assert.equal(deliveries,1);
 }finally{globalThis.fetch=original;setLeadHandoffTestDelivery(null);delete process.env.LEAD_HANDOFF_DRY_RUN;}
 console.log("PASS business chat: chat-only Peter, server profile, pricing, required answers, stale revocation, photos/isolation, durable idempotency, truthful closing, follow-ups, and existing background email/SMS routing");
}
main().catch(error=>{console.error(error);process.exitCode=1;});
