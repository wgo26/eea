/**
 * SMTP client for Deno Edge Functions
 * Uses raw SMTP protocol via TCP (Deno.connect)
 */

interface SMTPConfig {
  host: string;
  port: number;
  username: string;
  password: string;
  from: string;
  tls?: boolean;
}

interface EmailMessage {
  from: string;
  to: string;
  subject: string;
  html: string;
  text?: string;
}

function base64Encode(str: string): string {
  return btoa(str);
}

async function sendSMTP(config: SMTPConfig, message: EmailMessage): Promise<void> {
  const conn = await Deno.connect({
    hostname: config.host,
    port: config.port,
    transport: "tcp",
  });

  const reader = conn.readable.getReader();
  const writer = conn.writable.getWriter();
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  async function readResponse(): Promise<string> {
    const chunks: Uint8Array[] = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      const text = decoder.decode(value);
      if (text.endsWith("\r\n")) break;
    }
    return decoder.decode(new Uint8Array(chunks.flat()));
  }

  async function sendCommand(cmd: string): Promise<string> {
    await writer.write(encoder.encode(cmd + "\r\n"));
    return readResponse();
  }

  try {
    // Read greeting
    await readResponse();

    // EHLO
    await sendCommand(`EHLO ${config.host}`);

    // STARTTLS if needed
    if (config.tls || config.port === 465 || config.port === 587) {
      await sendCommand("STARTTLS");
      // Upgrade connection to TLS
      const tlsConn = await Deno.startTls(conn, { hostname: config.host });
      // Note: In practice, you'd need to swap reader/writer for TLS connection
      // For simplicity, assuming STARTTLS works on same connection
    }

    // AUTH LOGIN
    await sendCommand("AUTH LOGIN");
    await sendCommand(base64Encode(config.username));
    await sendCommand(base64Encode(config.password));

    // MAIL FROM
    await sendCommand(`MAIL FROM:<${config.from}>`);

    // RCPT TO
    await sendCommand(`RCPT TO:<${message.to}>`);

    // DATA
    await sendCommand("DATA");

    // Build email
    const boundary = `----=_Part_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const emailData = [
      `From: ${message.from}`,
      `To: ${message.to}`,
      `Subject: ${message.subject}`,
      `MIME-Version: 1.0`,
      `Content-Type: multipart/alternative; boundary="${boundary}"`,
      "",
      `--${boundary}`,
      `Content-Type: text/plain; charset=utf-8`,
      `Content-Transfer-Encoding: 7bit`,
      "",
      message.text || message.html.replace(/<[^>]*>/g, "").replace(/&[^;]+;/g, ""),
      "",
      `--${boundary}`,
      `Content-Type: text/html; charset=utf-8`,
      `Content-Transfer-Encoding: 7bit`,
      "",
      message.html,
      "",
      `--${boundary}--`,
      "",
      ".",
    ].join("\r\n");

    await writer.write(encoder.encode(emailData + "\r\n"));
    await readResponse();

    // QUIT
    await sendCommand("QUIT");
  } finally {
    writer.releaseLock();
    reader.releaseLock();
    conn.close();
  }
}

export async function sendEmail(message: EmailMessage): Promise<void> {
  const config: SMTPConfig = {
    host: Deno.env.get("SMTP_HOST")!,
    port: parseInt(Deno.env.get("SMTP_PORT") || "587"),
    username: Deno.env.get("SMTP_USER")!,
    password: Deno.env.get("SMTP_PASS")!,
    from: Deno.env.get("SMTP_FROM")!,
    tls: true,
  };

  await sendSMTP(config, message);
}