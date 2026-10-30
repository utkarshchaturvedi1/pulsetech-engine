import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";

const db = new PGlite();
const sql = async (path: string) => db.exec(await readFile(path, "utf8"));
async function main() {
await db.exec(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
create schema auth; create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
grant usage on schema auth to authenticated,service_role; grant execute on function auth.uid() to authenticated,service_role;`);
await sql("supabase/client_accounts.sql");
await sql("supabase/customer_leads.sql");
await sql("supabase/paddle_sandbox_notifications.sql");
await sql("supabase/client_billing.sql");
await sql("supabase/multi_provider_billing.sql");

const accounts = await db.query<{ id: string }>(`insert into public.customer_accounts(business_name,owner_email,demo_id) values
('Alpha','a@example.test','alpha-test'),('Beta','b@example.test','beta-test') returning id`);
const [a, b] = accounts.rows;
const userA = "20000000-0000-4000-8000-000000000001", userB = "20000000-0000-4000-8000-000000000002";
await db.query("insert into auth.users values ($1),($2)", [userA,userB]);
await db.query("insert into public.customer_memberships(user_id,customer_account_id) values($1,$2),($3,$4)", [userA,a.id,userB,b.id]);

const checkoutId = "30000000-0000-4000-8000-000000000001", token = "a".repeat(64), tokenHash = createHash("sha256").update(token).digest("hex");
await db.query("insert into public.checkout_intents(id,customer_account_id,token_hash,environment) values($1,$2,$3,'sandbox')", [checkoutId,a.id,tokenHash]);
const now = new Date().toISOString();
const command = { kind:"payment",eventId:"evt_"+"e".repeat(26),occurredAt:now,entityId:"txn_"+"f".repeat(26),customerId:"ctm_"+"g".repeat(26),subscriptionId:"sub_"+"h".repeat(26),transactionId:"txn_"+"f".repeat(26),intentId:checkoutId,tokenHash,status:"paid",initial:true,periodStart:now,periodEnd:new Date(Date.now()+30*86400000).toISOString(),environment:"sandbox" };
const apply = async (value: unknown) => (await db.query<{ apply_client_billing_event: string }>("select public.apply_client_billing_event($1::jsonb)", [JSON.stringify(value)])).rows[0].apply_client_billing_event;
assert.equal(await apply(command),"applied");
assert.equal(await apply(command),"duplicate");
assert.equal((await db.query<{billing_status:string}>("select billing_status from public.customer_accounts where id=$1",[a.id])).rows[0].billing_status,"paid");
assert.equal((await db.query<{consumed_transaction_id:string}>("select consumed_transaction_id from public.checkout_intents where id=$1",[checkoutId])).rows[0].consumed_transaction_id,command.transactionId);
assert.equal(await apply({...command,eventId:"evt_"+"i".repeat(26),transactionId:"txn_"+"j".repeat(26),entityId:"txn_"+"j".repeat(26),intentId:checkoutId}),"ignored","one-time intent cannot bind a second transaction");

const subEvent = {...command,kind:"subscription",eventId:"evt_"+"k".repeat(26),entityId:command.subscriptionId,transactionId:null,intentId:null,tokenHash:null,status:"past_due",initial:false,occurredAt:new Date(Date.now()+1000).toISOString()};
assert.equal(await apply(subEvent),"applied");
assert.equal((await db.query<{billing_status:string}>("select billing_status from public.customer_accounts where id=$1",[a.id])).rows[0].billing_status,"past_due");
assert.equal(await apply({...subEvent,eventId:"evt_"+"l".repeat(26),status:"paid",occurredAt:now}),"applied");
assert.equal((await db.query<{billing_status:string}>("select billing_status from public.customer_accounts where id=$1",[a.id])).rows[0].billing_status,"past_due","stale subscription state cannot reactivate service");

const adjustment = {...command,kind:"adjustment",eventId:"evt_"+"m".repeat(26),entityId:"adj_"+"n".repeat(26),intentId:null,tokenHash:null,status:"refunded",initial:false};
assert.equal(await apply(adjustment),"applied");
assert.equal((await db.query<{billing_status:string}>("select billing_status from public.customer_accounts where id=$1",[a.id])).rows[0].billing_status,"refunded");

const dodoIntent = "40000000-0000-4000-8000-000000000001", dodoTokenHash = "b".repeat(64);
await db.query("insert into public.checkout_intents(id,customer_account_id,token_hash,environment,provider) values($1,$2,$3,'live','dodo')", [dodoIntent,b.id,dodoTokenHash]);
const dodoCommand = {
  provider:"dodo",environment:"live",kind:"payment",eventId:"msg_payment_001",occurredAt:now,
  entityId:"pay_payment_001",paymentId:"pay_payment_001",customerId:"cus_dodo_001",subscriptionId:"sub_dodo_001",
  intentId:dodoIntent,tokenHash:dodoTokenHash,initial:true,status:"paid",periodStart:now,
  periodEnd:new Date(Date.now()+30*86400000).toISOString(),amount:250000,currency:"USD",
  setupProductId:"pdt_setup",monthlyProductId:"pdt_monthly",
  products:[{productId:"pdt_setup",quantity:1},{productId:"pdt_monthly",quantity:1}],
};
const applyDodo = async (value: unknown) => (await db.query<{ apply_dodo_billing_event: string }>("select public.apply_dodo_billing_event($1::jsonb)", [JSON.stringify(value)])).rows[0].apply_dodo_billing_event;
assert.equal(await applyDodo(dodoCommand),"applied");
assert.equal(await applyDodo(dodoCommand),"duplicate");
assert.deepEqual((await db.query<{billing_status:string;billing_provider:string;dodo_subscription_id:string}>("select billing_status,billing_provider,dodo_subscription_id from public.customer_accounts where id=$1",[b.id])).rows[0],{billing_status:"paid",billing_provider:"dodo",dodo_subscription_id:"sub_dodo_001"});
assert.equal(await applyDodo({...dodoCommand,eventId:"msg_bad_amount",entityId:"pay_bad_amount",paymentId:"pay_bad_amount",amount:1}),"ignored");
const dodoRenewal={...dodoCommand,eventId:"msg_renewal_001",entityId:"pay_renewal_001",paymentId:"pay_renewal_001",intentId:null,tokenHash:null,initial:false,amount:50000,products:[{productId:"pdt_monthly",quantity:1}]};
assert.equal(await applyDodo(dodoRenewal),"applied");
const dodoRefund={...dodoCommand,kind:"adjustment",eventId:"msg_refund_001",entityId:"ref_001",paymentId:"pay_payment_001",intentId:null,tokenHash:null,initial:false,status:"refunded"};
assert.equal(await applyDodo(dodoRefund),"applied");
assert.equal((await db.query<{billing_status:string}>("select billing_status from public.customer_accounts where id=$1",[b.id])).rows[0].billing_status,"refunded");

await db.query("update public.customer_accounts set billing_status='paid',billing_environment='live',handover_status='live' where id=$1",[a.id]);
await db.query("update public.customer_accounts set website_status='live',phone_status='live',launch_checked_at=now() where id=$1",[a.id]);
const reserve = async (conversationId: string) => (await db.query<{reserve_client_chat_conversation:boolean}>("select public.reserve_client_chat_conversation('alpha-test',$1)",[conversationId])).rows[0].reserve_client_chat_conversation;
assert.equal(await reserve("conversation-one"),true); assert.equal(await reserve("conversation-one"),true,"same conversation is not counted twice");
await db.exec("insert into public.client_chat_sessions(customer_account_id,conversation_id,period_start) select '"+a.id+"'::uuid,'conversation-'||n,date_trunc('month',now() at time zone 'utc')::date from generate_series(1,999) n");
assert.equal(await reserve("conversation-over-limit"),false,"one thousand included chats is the enforced monthly cap");
const voiceAvailable = async () => (await db.query<{client_voice_minutes_available:boolean}>("select public.client_voice_minutes_available('alpha-test')")).rows[0].client_voice_minutes_available;
assert.equal(await voiceAvailable(),true);
await db.query("insert into public.client_voice_calls(conversation_id,customer_account_id,period_start,duration_seconds) values('voice-seed',$1,date_trunc('month',now() at time zone 'utc')::date,14900)",[a.id]);
await db.query("select public.record_client_voice_call('alpha-test','voice-overage',100)"); await db.query("select public.record_client_voice_call('alpha-test','voice-overage',100)");
assert.equal(await voiceAvailable(),false,"250 inbound minutes disables additional phone calls");
const lead = {conversation_id:"conversation-123",customer_name:"Jordan",customer_phone:"+15551234567",customer_email:"jordan@example.test",primary_need:"Heat pump repair",urgency:"SOON",alert_delivery_status:"QUEUED",capture_status:"partial"};
await db.query("select public.capture_client_lead('alpha-test',$1::jsonb)",[JSON.stringify(lead)]);
const captured = (await db.query<{id:string;first_captured_at:string}>("select id,first_captured_at from public.customer_leads where customer_account_id=$1",[a.id])).rows[0];
await db.query("update public.customer_leads set sales_outcome='converted',sale_amount_usd=1250 where id=$1",[captured.id]);
await db.query("select public.capture_client_lead('alpha-test',$1::jsonb)",[JSON.stringify({...lead,customer_phone:null,customer_email:null,primary_need:"Updated need",capture_status:"qualified",alert_delivery_status:"SENT"})]);
const merged = (await db.query<{customer_phone:string;customer_email:string;sales_outcome:string;sale_amount_usd:number;first_captured_at:string;primary_need:string}>("select * from public.customer_leads where id=$1",[captured.id])).rows[0];
assert.equal(merged.customer_phone,lead.customer_phone); assert.equal(merged.customer_email,lead.customer_email); assert.equal(merged.sales_outcome,"converted"); assert.equal(Number(merged.sale_amount_usd),1250); assert.equal(new Date(merged.first_captured_at).toISOString(),new Date(captured.first_captured_at).toISOString()); assert.equal(merged.primary_need,"Updated need");

await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${userA}',false);`);
const usage = await db.query<{website_chat_conversations:number;inbound_voice_minutes:string}>("select * from public.get_client_monthly_usage()");
assert.equal(usage.rows[0].website_chat_conversations,1000); assert.equal(Number(usage.rows[0].inbound_voice_minutes),250);
const weekly = await db.query<{new_enquiries:number;converted_leads:number}>("select * from public.get_client_weekly_report()");
assert.equal(weekly.rows[0].new_enquiries,1); assert.equal(weekly.rows[0].converted_leads,1);
const own = await db.query<{id:string}>("select id,business_name from public.customer_accounts");
assert.equal(own.rows.length,1); assert.equal(own.rows[0].id,a.id);
assert.equal((await db.query("select id from public.customer_leads")).rows.length,1);
await assert.rejects(db.query("select paddle_customer_id from public.customer_accounts"),/permission denied/i,"provider customer identifiers stay hidden from member-facing reads");
await assert.rejects(db.query("select * from public.client_voice_calls"),/permission denied/i,"call usage identifiers stay private");
await assert.rejects(db.query("update public.customer_accounts set handover_status='live' where id=$1",[b.id]),/permission denied|row-level security/i);
await db.exec("reset role");

console.log("PASS billing SQL: Paddle and Dodo migrations, provider-bound tenant binding, idempotency, renewals, refunds, lead merge and tenant RLS");
await db.close();
}
main().catch(async (error) => { console.error(error); process.exitCode = 1; await db.close(); });
