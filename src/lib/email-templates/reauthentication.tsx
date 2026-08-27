import * as React from "react";

import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Section,
  Text,
} from "@react-email/components";

import { accent, code, container, footer, h1, main, text } from "./theme";

interface ReauthenticationEmailProps {
  token: string;
}

export const ReauthenticationEmail = ({ token }: ReauthenticationEmailProps) => (
  <Html lang="es" dir="ltr">
    <Head />
    <Preview>Tu código de verificación</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={accent} />
        <Heading style={h1}>Tu código de verificación</Heading>
        <Text style={text}>Introduce este código para confirmar tu identidad:</Text>
        <Text style={code}>{token}</Text>
        <Text style={footer}>
          Si no has solicitado este código, puedes ignorar este mensaje.
          <br />
          Cazú Ceramics
        </Text>
      </Container>
    </Body>
  </Html>
);

export default ReauthenticationEmail;
