const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const { logger } = require('firebase-functions');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { priceLines, customerMail, infoMail } = require('./mails');

initializeApp();
const db = getFirestore();

const SOURCE = 'bestelformulier-kerst-2026';

exports.kerstbestellingMails = onDocumentCreated(
  { document: 'tsmoakt_requests/{id}', region: 'europe-west1' },
  async (event) => {
    const order = event.data?.data();
    if (!order || order.source !== SOURCE) return;
    const id = event.params.id;
    const ref = id.slice(0, 6).toUpperCase();
    const priced = priceLines(order.orderLines);
    if (!priced.lines.length) { logger.warn('Kerstbestelling zonder geldige lijnen', { id }); return; }

    // Vaste document-id's: als de trigger dubbel loopt, faalt create() en gaat er geen tweede mail uit.
    const writes = [
      db.collection('mail').doc(`${id}-klant`).create(customerMail(order, ref, priced)),
      db.collection('mail').doc(`${id}-info`).create(infoMail(order, ref, priced))
    ];
    const results = await Promise.allSettled(writes);
    results.filter((r) => r.status === 'rejected' && r.reason?.code !== 6)
      .forEach((r) => logger.error('Mail klaarzetten mislukt', { id, error: String(r.reason) }));

    await event.data.ref.update({
      verifiedTotal: priced.total,
      priceWarnings: priced.problems,
      mailsQueuedAt: FieldValue.serverTimestamp()
    });
  }
);

