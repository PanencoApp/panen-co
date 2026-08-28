import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type EmailRequest =
  | {
      type: "new-signup";
      email: string;
      pseudo: string;
    }
  | {
      type: "support";
      email: string;
      message: string;
      pseudo: string;
      subject: string;
    };

const supportEmail = process.env.SUPPORT_EMAIL ?? "contact@panencoapp.com";
const senderEmail = process.env.BREVO_SENDER_EMAIL ?? "contact@panencoapp.com";

function clean(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function htmlEscape(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function buildEmail(payload: EmailRequest) {
  if (payload.type === "new-signup") {
    const pseudo = htmlEscape(clean(payload.pseudo));
    const email = htmlEscape(clean(payload.email));

    return {
      htmlContent: `
        <h2>Nouvelle inscription Panen&Co</h2>
        <p><strong>Pseudo :</strong> ${pseudo}</p>
        <p><strong>Email :</strong> ${email}</p>
        <p><strong>Date :</strong> ${new Intl.DateTimeFormat("fr-FR", {
          dateStyle: "full",
          timeStyle: "short",
          timeZone: "Europe/Paris",
        }).format(new Date())}</p>
      `,
      subject: `Nouvel inscrit Panen&Co : ${clean(payload.pseudo)}`,
    };
  }

  const pseudo = htmlEscape(clean(payload.pseudo));
  const email = htmlEscape(clean(payload.email));
  const subject = htmlEscape(clean(payload.subject));
  const message = htmlEscape(payload.message.trim()).replaceAll("\n", "<br />");

  return {
    htmlContent: `
      <h2>Nouvelle demande centre d'aide</h2>
      <p><strong>Pseudo :</strong> ${pseudo}</p>
      <p><strong>Email :</strong> ${email}</p>
      <p><strong>Sujet :</strong> ${subject}</p>
      <hr />
      <p>${message}</p>
    `,
    subject: `Centre d'aide Panen&Co : ${clean(payload.subject)}`,
  };
}

export async function POST(request: NextRequest) {
  const apiKey = process.env.BREVO_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      { error: "Configuration Brevo incomplète." },
      { status: 500 },
    );
  }

  const payload = (await request.json()) as EmailRequest;

  if (!payload.email || !payload.pseudo) {
    return NextResponse.json(
      { error: "Informations utilisateur incomplètes." },
      { status: 400 },
    );
  }

  if (payload.type === "support" && (!payload.subject || !payload.message)) {
    return NextResponse.json(
      { error: "Sujet et message requis." },
      { status: 400 },
    );
  }

  const email = buildEmail(payload);
  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    body: JSON.stringify({
      htmlContent: email.htmlContent,
      sender: {
        email: senderEmail,
        name: "Panen&Co",
      },
      subject: email.subject,
      to: [
        {
          email: supportEmail,
          name: "Panen&Co",
        },
      ],
    }),
    headers: {
      accept: "application/json",
      "api-key": apiKey,
      "content-type": "application/json",
    },
    method: "POST",
  });

  if (!response.ok) {
    const details = await response.text();

    return NextResponse.json(
      { error: details || "Email non envoyé." },
      { status: response.status },
    );
  }

  return NextResponse.json({ ok: true });
}
