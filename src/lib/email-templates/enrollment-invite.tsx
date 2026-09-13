import * as React from "react";
import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import type { TemplateEntry } from "./registry";

export interface EnrollmentInviteProps {
  name?: string;
  inviteUrl?: string;
  classes?: string[];
}

const body = { backgroundColor: "#ffffff", fontFamily: "Inter, Arial, sans-serif", margin: 0 };
const container = {
  maxWidth: "520px",
  margin: "24px auto",
  backgroundColor: "#FFFDF8",
  border: "1px solid #E8DFD2",
  borderRadius: "12px",
  padding: "28px",
};
const accent = {
  height: "4px",
  width: "48px",
  backgroundColor: "#C96F4A",
  borderRadius: "2px",
  margin: "0 0 20px",
};
const h1 = { fontSize: "22px", fontWeight: 600 as const, color: "#2E2419", margin: "0 0 12px" };
const text = { fontSize: "15px", lineHeight: "1.55", color: "#2E2419", margin: "0 0 16px" };
const listBox = {
  border: "1px solid #E8DFD2",
  borderRadius: "8px",
  padding: "12px 14px",
  margin: "0 0 20px",
};
const item = { fontSize: "14px", lineHeight: "1.5", color: "#2E2419", margin: "0 0 4px" };
const button = {
  backgroundColor: "#C96F4A",
  color: "#FFFDF8",
  fontSize: "15px",
  fontWeight: 600 as const,
  textDecoration: "none",
  padding: "12px 22px",
  borderRadius: "8px",
  display: "inline-block",
};
const small = { fontSize: "13px", lineHeight: "1.5", color: "#8A7B6B", margin: "20px 0 0" };

const Email = ({ name, inviteUrl, classes }: EnrollmentInviteProps) => {
  const url = inviteUrl ?? "https://reservas.cazuceramics.com";
  return (
    <Html lang="es" dir="ltr">
      <Head />
      <Preview>Tu plaza está confirmada — crea tu cuenta en Cazú Ceramics</Preview>
      <Body style={body}>
        <Container style={container}>
          <Section style={accent} />
          <Heading style={h1}>¡Hola {name?.trim() || "!"}</Heading>
          <Text style={text}>
            Tu solicitud ha sido aceptada y ya tienes plaza en el taller. Para terminar, crea tu
            cuenta desde el botón de abajo y quedarás inscrita automáticamente.
          </Text>

          {classes && classes.length > 0 ? (
            <Section style={listBox}>
              <Text style={{ ...item, fontWeight: 600 }}>Tus clases reservadas</Text>
              {classes.map((c) => (
                <Text key={c} style={item}>
                  · {c}
                </Text>
              ))}
            </Section>
          ) : null}

          <Section style={{ margin: "0 0 20px" }}>
            <Button href={url} style={button}>
              Crear mi cuenta
            </Button>
          </Section>

          <Text style={{ fontSize: "13px", lineHeight: "1.5", color: "#8A7B6B", margin: 0 }}>
            Si el botón no funciona, copia y pega este enlace en tu navegador:
            <br />
            <Link href={url} style={{ color: "#C96F4A" }}>
              {url}
            </Link>
          </Text>

          <Text style={small}>
            Cazú Ceramics · Estudio de cerámica en Ruzafa, Calle del Dr. Sumsi 9, Valencia
          </Text>
        </Container>
      </Body>
    </Html>
  );
};

export const template = {
  component: Email,
  subject: "Tu plaza está confirmada — crea tu cuenta",
  displayName: "Invitación de inscripción",
  previewData: {
    name: "Mora",
    inviteUrl: "https://reservas.cazuceramics.com/unirse/ejemplo-token",
    classes: ["miércoles, 16 de septiembre · 15:00–17:00 (Cande)"],
  },
} satisfies TemplateEntry;
