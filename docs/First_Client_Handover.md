# First-client handover (manual, first 1–10 clients)

This is the operating procedure for a paid client. Payment confirmation and business facts are handled manually for the first clients; the portal supplies the website installation code and client-specific access.

## PulseTech prepares

1. Confirm payment in the payment provider and link the already-saved approved demo to the client's login through `/client`.
2. Invite the client's work email. The generated customer ID, business profile ID, and login are kept with that customer account.
3. Confirm that the Vercel public base URL points at the intended environment. The client portal then generates the embed code from that environment and the linked business profile.
4. For phone service, allocate or connect a dedicated inbound Twilio number and add the E.164 number-to-profile mapping to `INBOUND_VOICE_NUMBER_MAP`. Configure that Twilio number's incoming Voice webhook to `/api/twilio/voice-demo`. Never use the shared access-code demo number as a client line.
5. Run the pre-launch tests in the acceptance checklist below. Do not mark the account live until call, chat, saved instructions, pricing boundaries, and actual lead alerts pass.

## Client installs website chat

The client signs in at `/login`, opens `/client`, copies their generated iframe snippet, and adds it where they want the chat panel to appear:

- WordPress: a Custom HTML block.
- Wix: an Embed HTML element.
- Squarespace: a Code block that permits an iframe.
- Other builders: an HTML/iframe embed block.

The widget is isolated in an iframe, so its layout does not inherit the host site's CSS. The width follows its container up to 420px; its height is 640px. The client can open the preview link from the portal before publishing the embed. PulseTech reviews the placement on desktop and mobile during the first-client handover.

## Phone number ownership

- The client's existing published business number remains theirs. If they want to keep it, they arrange inbound forwarding with their telephone provider to the dedicated Twilio destination that PulseTech configures for their account. Forwarding fees, if any, are confirmed with that provider.
- The Twilio destination number in PulseTech's account is managed by PulseTech and must be disclosed as such. It is not represented as client-owned or portable.
- If the client requires number ownership and portability, the number must be provisioned in an account owned by that client and the routing arrangement agreed before activation. Do not collect or share account passwords; use provider-authorized access or have the client configure the routing.

## Client acceptance before activation

The client checks the website placement on desktop and mobile and tests the saved business information in chat and voice. PulseTech independently verifies:

- lead capture in this order: name, phone, service address;
- saved Peter instructions are followed after refresh/new conversations;
- only owner-confirmed prices, visit fees, hours, services, and policies are stated;
- no unconfirmed booking or false "alert sent" statement is made;
- chat and inbound voice route to the same correct business profile;
- real email and SMS alerts arrive at the client's approved recipients.

## Ownership and closeout

The client controls its website and website account. The client owns customer enquiry information collected for its business; PulseTech and its contracted service providers process it to deliver the service. The client is responsible for approved business facts, its website embed, and maintaining access to its own website and existing phone service. PulseTech is responsible for the AI configuration, hosting, mapped phone route, and support during the agreed service period.

For cancellation, remove the iframe from the client's website, stop or remove its dedicated number mapping, end the service, and provide an export of available lead records on request. Do not delete or change customer records until the export and applicable retention obligations are addressed.

## Current constraints

- The customer portal and embed require the `client_accounts.sql` migration and Supabase Auth to be configured in the deployment. They are not considered usable until tested in an isolated Preview environment.
- The website embed is available as a code path in this release candidate; it has not yet been placed on the Production PulseTech Labs homepage.
- Client phone numbers are provisioned and mapped manually for the initial cohort. There is no self-service number purchase, porting, carrier forwarding, billing, or automatic number assignment.
- The portal currently has no customer lead-history or business-settings dashboard. Those are separate from this first-client handover and are not implied by the installation card.
