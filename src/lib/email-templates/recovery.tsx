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

interface RecoveryEmailProps {
  siteName: string
  confirmationUrl: string
}

export const RecoveryEmail = ({ siteName, confirmationUrl }: RecoveryEmailProps) => (
  <Html lang="es" dir="ltr">
    <Head />
    <Preview>Restablece tu contraseña de {siteName}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={accent} />
        <Heading style={h1}>Restablece tu contraseña</Heading>
        <Text style={text}>
          Hemos recibido una solicitud para restablecer la contraseña de tu cuenta en{' '}
          <strong>{siteName}</strong>.
        </Text>
        <Text style={text}>Haz clic en el botón para elegir una contraseña nueva:</Text>
        <Button style={button} href={confirmationUrl}>
          Crear contraseña nueva
        </Button>
        <Text style={footer}>
          Si no has solicitado este cambio, puedes ignorar este mensaje: tu contraseña seguirá
          siendo la misma.
          <br />
          Cazú Ceramics
        </Text>
      </Container>
    </Body>
  </Html>
)

export default RecoveryEmail
