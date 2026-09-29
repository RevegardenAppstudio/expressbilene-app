import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";

const CONTACT_EMAIL = "post@expressbilene.no";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const email = typeof body?.email === "string" ? body.email.trim() : "";
  const message = typeof body?.message === "string" ? body.message.trim() : "";

  if (!name || !email || !message) {
    return NextResponse.json({ error: "Fyll ut navn, e-post og melding." }, { status: 400 });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Ugyldig e-postadresse." }, { status: 400 });
  }
  if (name.length > 200 || email.length > 200 || message.length > 5000) {
    return NextResponse.json({ error: "For lang tekst i et av feltene." }, { status: 400 });
  }

  const resend = new Resend(process.env.RESEND_API_KEY);

  try {
    const { error } = await resend.emails.send({
      from: "Expressbilene nettside <kontakt@expressbilene.no>",
      to: CONTACT_EMAIL,
      replyTo: email,
      subject: `Henvendelse fra ${name}`,
      text: `${message}\n\n—\n${name}\n${email}`,
    });
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Kunne ikke sende kontaktskjema-e-post:", error);
    return NextResponse.json({ error: "Kunne ikke sende meldingen. Prøv igjen senere." }, { status: 500 });
  }
}
