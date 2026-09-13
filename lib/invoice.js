// There's no real email provider wired up (same situation as payments - see
// routes/payments.js). Instead of pretending to send an email, this builds
// the actual invoice content and stores it, and the driver can view exactly
// what would have been emailed at GET /api/parking/sessions/:id/invoice.
// Swapping in a real provider (SES/SendGrid) later just means taking this
// HTML and actually dispatching it, rather than changing what it contains.

function money(cents) {
  return '\u20b9' + (cents / 100).toFixed(2);
}

function buildInvoiceHtml({ session, spotCode }) {
  const invoiceId = `INV-${String(session.id).padStart(6, '0')}`;
  return `
<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px;border:1px solid #ddd;border-radius:12px;">
  <h2 style="margin-top:0;">Parking receipt</h2>
  <p style="color:#666;font-size:13px;">${invoiceId}</p>
  <table style="width:100%;font-size:14px;border-collapse:collapse;">
    <tr><td style="padding:4px 0;color:#666;">Name</td><td style="text-align:right;">${session.driver_name}</td></tr>
    <tr><td style="padding:4px 0;color:#666;">Vehicle number</td><td style="text-align:right;"><strong>${session.vehicle_number}</strong></td></tr>
    <tr><td style="padding:4px 0;color:#666;">Spot allotted</td><td style="text-align:right;">${spotCode}</td></tr>
    <tr><td style="padding:4px 0;color:#666;">Entry time</td><td style="text-align:right;">${new Date(session.entry_time).toLocaleString()}</td></tr>
    <tr><td style="padding:4px 0;color:#666;">Valid until</td><td style="text-align:right;">${session.expected_exit_time ? new Date(session.expected_exit_time).toLocaleString() : '-'}</td></tr>
  </table>
  <hr style="border:none;border-top:1px solid #eee;margin:16px 0;">
  <table style="width:100%;font-size:16px;">
    <tr><td><strong>Amount paid</strong></td><td style="text-align:right;"><strong>${money(session.fee_cents)}</strong></td></tr>
  </table>
  <p style="color:#999;font-size:12px;margin-top:24px;">This is a mock invoice generated for demo purposes - no real payment was processed.</p>
</div>`.trim();
}

module.exports = { buildInvoiceHtml };
