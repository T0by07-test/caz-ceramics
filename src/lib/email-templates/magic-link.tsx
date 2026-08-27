import * as React from "react";

import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Section,
  Text,
} from "@react-email/components";

import { accent, button, container, footer, h1, main, text } from "./theme";

interface MagicLinkEmailProps {
  siteName: string;
  confirmationUrl: string;
}

export const MagicLinkEmail = ({ siteName, confirmationUrl }: MagicLinkEmailProps) => (
  <Html lang="es" dir="ltr">
    <Head />
    <Preview>Tu enlace de acceso a {siteName}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={accent} />
        <Heading style={h1}>Tu enlace de acceso</Heading>
        <Text style={text}>
          Entra en <strong>{siteName}</strong> con este enlace, sin necesidad de contraseña:
        </Text>
        <Button style={button} href={confirmationUrl}>
          Entrar
        </Button>
        <Text style={footer}>
          Si no has pedido este enlace, puedes ignorar este mensaje.
          <br />
          Cazú Ceramics
        </Text>
      </Container>
    </Body>
  </Html>
);

export default MagicLinkEmail;
