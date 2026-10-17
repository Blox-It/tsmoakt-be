const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const { defineSecret } = require('firebase-functions/params');
const { logger } = require('firebase-functions');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const nodemailer = require('nodemailer');
const { priceLines, customerMail, infoMail } = require('./mails');

initializeApp();
const db = getFirestore();

const SOURCE = 'bestelformulier-kerst-2026';
// Vimexx: mail.<domein>, poort 465 met SSL (https://www.vimexx.nl/help/email-instellingen-imap-pop3-smtp)
const SMTP_HOST = 'mail.tsmoakt.be';
const SMTP_USER = 'lesley@tsmoakt.be';
const FROM = "'t Smoakt <lesley@tsmoakt.be>";
const SMTP_PASSWORD = defineSecret('SMTP_PASSWORD');

exports.kerstbestellingMails = onDocumentCreated(
  { document: 'tsmoakt_requests/{id}', region: 'europe-west1', secrets: [SMTP_PASSWORD] },
  async (event) => {
    const order = event.data?.data();
    if (!order || order.source !== SOURCE) return;
    const id = event.params.id;
    const ref = id.slice(0, 6).toUpperCase();
    const priced = priceLines(order.orderLines);
    if (!priced.lines.length) { logger.warn('Kerstbestelling zonder geldige lijnen', { id }); return; }

    const transport = nodemailer.createTransport({
      host: SMTP_HOST, port: 465, secure: true,
      auth: { user: SMTP_USER, pass: SMTP_PASSWORD.value() }
    });

    const result = { verifiedTotal: priced.total, priceWarnings: priced.problems };
    for (const [kind, mail] of [['klant', customerMail(order, ref, priced)], ['info', infoMail(order, ref, priced)]]) {
      // Markering vooraf: loopt de trigger dubbel, dan faalt create() en gaat er geen tweede mail uit.
      const marker = db.collection('tsmoakt_mails').doc(`${id}-${kind}`);
      try {
        await marker.create({ order: id, kind, createdAt: FieldValue.serverTimestamp() });
      } catch {
        continue;
      }
      try {
        await transport.sendMail({ from: FROM, to: mail.to, replyTo: mail.replyTo, subject: mail.message.subject, html: mail.message.html, text: mail.message.text });
        await marker.update({ sentAt: FieldValue.serverTimestamp() });
        result[`mail_${kind}`] = 'verstuurd';
      } catch (err) {
        logger.error('Mail versturen mislukt', { id, kind, error: String(err) });
        await marker.update({ error: String(err) });
        result[`mail_${kind}`] = `mislukt: ${String(err).slice(0, 300)}`;
      }
    }
    await event.data.ref.update(result);
  }
);
