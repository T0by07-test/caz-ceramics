import * as React from 'react'

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
} from '@react-email/components'

import { accent, button, container, footer, h1, main, text } from './theme'

interface EmailChangeEmailProps {
  siteName: string
  oldEmail: string
  email: string
  newEmail: string
  confirmationUrl: string
}

export const EmailChangeEmail = ({
  siteName,
  oldEmail,
  newEmail,
  confirmationUrl,
}: EmailChangeEmailProps) => (
  <Html lang="es" dir="ltr">
    <Head />
    <Preview>Confirma tu nuevo email en {siteName}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={accent} />
        <Heading style={h1}>Confirma tu nuevo email</Heading>
        <Text style={text}>
          Has solicitado cambiar el email de tu cuenta en <strong>{siteName}</strong>
          {oldEmail ? ` de ${oldEmail}` : ''}
          {newEmail ? ` a ${newEmail}` : ''}.
        </Text>
        <Text style={text}>Confirma el cambio haciendo clic en el botón:</Text>
        <Button style={button} href={confirmationUrl}>
          Confirmar cambio
        </Button>
        <Text style={footer}>
          Si no has solicitado este cambio, puedes ignorar este mensaje.
          <br />
          Cazú Ceramics
        </Text>
      </Container>
    </Body>
  </Html>
)

export default EmailChangeEmail
