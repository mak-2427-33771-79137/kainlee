// Runs once when the server starts: start the WhatsApp (Xpressbot) background sender.
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const { startWhatsAppWorker } = await import('./lib/wa');
  startWhatsAppWorker();
}
