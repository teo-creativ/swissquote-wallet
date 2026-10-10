# Recovery terms

> These terms describe how you can regain access to your wallet if you lose your phone, and how you can leave without Swissquote. In this prototype the process is real in its steps but runs on a test network, with a simulated Swissquote service.

## 1. How your wallet is protected

Your wallet key is split into three shares and two are needed to sign. Your phone holds one share. Your lawyer holds one. Swissquote holds the third, and uses it only for recovery. You do not have a seed phrase.

## 2. What recovery does

If you lose your phone, you create a new wallet on a new device and your assets are moved to it. Your wallet address changes. Your old wallet is emptied and then no longer used. Move any standing instructions you have, such as saved payment details, to the new address.

## 3. Who is involved

- **You** start the recovery from a new device by signing in to your Swissquote account.
- **Swissquote** checks your identity again with its own procedures and signs with its share.
- **Your lawyer** confirms the request with a passkey approval linked to this specific recovery and to the old and new addresses.

Recovery cannot happen without all three of these steps. Swissquote alone cannot start it. Your lawyer alone cannot start it.

## 4. Waiting period and cancellation

After approval, a waiting period starts. In this prototype it lasts two minutes so it can be demonstrated. In a real product it would be 24 hours. During this period:

- you can cancel the recovery at any time from any device where you are signed in;
- your lawyer can also cancel it;
- alerts are sent through the app and the lawyer portal, and never by email.

The transfer to your new wallet only happens when the waiting period ends and has not been cancelled. Both the lawyer service and the Swissquote service check the waiting period on their own.

## 5. If an attacker tries

An attacker with your phone and your email must still pass Swissquote's identity check, wait for the delay and obtain your lawyer's approval. A failed identity check ends the recovery, creates an alert for your lawyer and moves no assets. Every step is recorded in a record that cannot be changed without detection.

## 6. Leaving without Swissquote

You can create an exit kit in the app. The kit is an encrypted file protected by a passphrase of your choice. It is never stored on our servers. If Swissquote's services are permanently gone, you can use the exit kit with your lawyer to move your assets to an address you choose. Your lawyer reviews every exit request by hand.

- Keep the kit file and its passphrase in different places, away from your phone.
- The kit alone cannot move assets.
- If you lose the kit and your phone and Swissquote is gone, your assets cannot be recovered.

## 7. When recovery fails

Recovery needs working parties. If your lawyer and Swissquote are both unavailable, or if your identity check fails repeatedly, recovery may not be possible. In that case your assets can be lost permanently. See the Risk warning.

## 8. Costs

No fee is charged in this prototype. Network fees on the test network are paid by a simulated Swissquote service.

## 9. Information used

Recovery uses your account reference, the status and times of the process, and the addresses involved. See the Privacy policy.
