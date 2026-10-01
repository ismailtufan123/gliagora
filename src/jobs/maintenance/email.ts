// Sending one automatic email (M4.7): the tasks import it from here. The code lives in
// src/lib/email/deliver.ts since M4b, where the forms that email a link while the person waits use
// it too; `sendOne()` also reports the server's reply code and enhanced status.
export {
  type Delivery,
  type SendResult,
  type SmtpReply,
  accepted,
  deliver,
  sendOne,
} from '@/lib/email/deliver'
