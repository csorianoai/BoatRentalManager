# Guía de Integración GetMyBoat - Nadaki Excursions

## 📍 Ubicación de la Pestaña de Gastos Programados

La pestaña **"Gastos Programados"** se encuentra en:
- **URL**: `/boat-maintenance.html`
- **Ubicación**: Segunda pestaña después de "Gastos"
- **Funcionalidad**: Gestión de gastos recurrentes (marina, seguros, mantenimiento)

---

## 🚤 Integración GetMyBoat - Estado Actual

### ✅ Ya Configurado en Tu Sistema

Tu sistema Nadaki Excursions **YA ESTÁ PREPARADO** para recibir notificaciones de GetMyBoat automáticamente. Aquí está lo que ya funciona:

#### 1. **Sincronización Automática de Emails**
- 📧 **Correo monitoreado**: `sales@nadakiexcursions.com`
- ⏰ **Frecuencia**: Cada 2 minutos (cron job automático)
- 🔍 **Detección**: El sistema detecta automáticamente emails de GetMyBoat usando patrones:
  - Emails desde: `@getmyboat.com`
  - Asunto contiene: "GetMyBoat", "Get My Boat"

#### 2. **Centro de Mensajes Integrado**
- ✅ GetMyBoat aparece en la lista de plataformas
- 🎨 Ícono: 🚤 (barco de motor)
- 🎨 Color: #00A3E0 (azul GetMyBoat)
- 📥 Todos los emails de GetMyBoat se organizan automáticamente en threads

#### 3. **Tipos de Notificaciones Capturadas**
El sistema captura automáticamente:
- 💬 **Consultas de clientes** (inquiries)
- ✅ **Confirmaciones de reserva** (booking confirmations)
- 💰 **Notificaciones de pago** (payment notifications)
- 📧 **Mensajes entre tú y el cliente**

---

## 📋 Cómo Funciona GetMyBoat con Tu Sistema

### Flujo Completo de Notificaciones

```
Cliente hace consulta en GetMyBoat
           ↓
GetMyBoat envía email a sales@nadakiexcursions.com
           ↓
Sistema Nadaki detecta email cada 2 minutos
           ↓
Crea thread automático en Centro de Mensajes
           ↓
Extrae: nombre cliente, email, teléfono, fecha solicitud
           ↓
¡Aparece en tu inbox para responder!
```

### Monitoreo de Pagos

GetMyBoat envía notificaciones de pago por email:
- **Reserva confirmada**: Cliente acepta oferta y paga
- **Pago procesado**: GetMyBoat retiene el dinero en escrow
- **Pago liberado**: 48 horas después de completar el viaje

**Tu sistema captura estos emails automáticamente** y los muestra en el centro de mensajes con toda la información.

---

## 🔧 Configuración Requerida (Paso a Paso)

### Paso 1: Configurar Email Corporativo

GetMyBoat ya está enviando notificaciones a `sales@nadakiexcursions.com`. Solo necesitas asegurarte de que las credenciales IMAP estén configuradas:

```bash
EMAIL_USER=sales@nadakiexcursions.com
EMAIL_PASSWORD=[tu contraseña de Outlook]
EMAIL_IMAP_HOST=outlook.office365.com
EMAIL_IMAP_PORT=993
```

**Nota**: Si ya estás recibiendo emails de otras plataformas (Airbnb, Viator, etc.) en tu centro de mensajes, ¡GetMyBoat también funcionará automáticamente!

### Paso 2: Configurar Notificaciones en GetMyBoat

1. **Accede a tu cuenta de propietario**: https://www.getmyboat.com/owner
2. **Ve a Settings (Configuración)**
3. **Email Notifications (Notificaciones por Email)**:
   - ✅ New inquiry notifications → `sales@nadakiexcursions.com`
   - ✅ Booking confirmations → `sales@nadakiexcursions.com`
   - ✅ Payment notifications → `sales@nadakiexcursions.com`
   - ✅ Message notifications → `sales@nadakiexcursions.com`

4. **SMS Notifications (Notificaciones por SMS)**:
   - ✅ Activa SMS para alertas urgentes
   - Número: [tu número de teléfono]

5. **Mobile App**:
   - 📱 Descarga la app GetMyBoat (iOS/Android)
   - 🔔 Activa push notifications para respuesta inmediata

---

## 📱 Canales de Notificación Recomendados

### Para Respuesta Inmediata (0-5 minutos)
1. **SMS/Text** → GetMyBoat envía link directo
2. **App móvil** → Push notification en tiempo real
3. **Email** → Sincronización automática cada 2 min en Nadaki

### Para Gestión Organizada
- **Centro de Mensajes Nadaki** → Todos los mensajes centralizados
- Responde directamente desde el portal
- Historial completo de conversaciones
- Sugerencias AI automáticas

---

## 💰 Monitoreo de Pagos - Cómo Funciona

### Timeline de Pagos GetMyBoat

| Evento | Cuándo | Notificación Email | Visible en Nadaki |
|--------|--------|-------------------|-------------------|
| Cliente envía consulta | Inmediato | ✅ Sí | ✅ Sí (Centro de Mensajes) |
| Envías oferta | Manual | ❌ No | ✅ Sí (puedes registrar) |
| Cliente acepta y paga | Inmediato | ✅ Sí | ✅ Sí (Centro de Mensajes) |
| Viaje completado | Manual | ❌ No | Manual en sistema |
| GetMyBoat procesa pago | 48h después | ✅ Sí | ✅ Sí (Centro de Mensajes) |
| Dinero en tu banco | 5-10 días | ✅ Sí | Manual en contabilidad |

### Captura de Información de Pagos

El sistema Nadaki extrae automáticamente de los emails:
- 💰 **Monto del pago**
- 📅 **Fecha del viaje**
- 👤 **Nombre del cliente**
- 🆔 **Número de reserva GetMyBoat**
- 📧 **Email del cliente**

---

## 🎯 Uso del Centro de Mensajes

### Acceso
URL: `/messages.html`

### Funcionalidades

#### 1. **Inbox (Bandeja de Entrada)**
- Ver todos los mensajes de GetMyBoat (filtro por plataforma)
- Estado: Abierto / Respondido / Cerrado
- Contador de mensajes no leídos

#### 2. **Conversación**
- Historial completo con el cliente
- Información del cliente (email, teléfono)
- Plataforma de origen (GetMyBoat 🚤)
- Estado de la reserva

#### 3. **Respuesta**
Opciones:
- 📧 **Enviar por Email** → Respuesta automática
- 💬 **Enviar por WhatsApp** → Si tienes Twilio configurado
- ✍️ **Marcar como respondido** → Si respondiste manualmente

#### 4. **Templates (Plantillas)**
Usa plantillas predefinidas con variables:
- `{{customer_name}}` → Nombre del cliente
- `{{booking_date}}` → Fecha de la reserva
- `{{available_boats_with_prices}}` → Barcos disponibles
- Previsualización en tiempo real

#### 5. **Sugerencias AI**
El sistema analiza la consulta del cliente y sugiere:
- Barcos disponibles para la fecha solicitada
- Respuestas predefinidas
- Información de precios

---

## 🔐 Limitaciones de la API GetMyBoat

**IMPORTANTE**: GetMyBoat **NO tiene API pública**. Esto significa:

❌ No hay webhooks en tiempo real
❌ No hay integración directa de pagos
❌ No hay actualización automática de calendario

✅ **SOLUCIÓN**: Email como método de integración
- Todas las notificaciones llegan por email
- Tu sistema las procesa automáticamente
- Funciona igual de bien que una API

### Alternativas Probadas

1. **Email monitoring** (implementado ✅)
2. **Manual ingestion** (implementado ✅)
3. **Mobile app** (recomendado para alertas urgentes)

---

## 📊 Analytics y Reportes

En el tab **Analytics** del Centro de Mensajes puedes ver:
- 📈 Volumen de mensajes por plataforma (incluye GetMyBoat)
- ⏱️ Tiempo promedio de respuesta
- 💬 Mensajes por estado
- 🎯 Performance por plataforma

---

## 🚨 Troubleshooting

### "No veo mensajes de GetMyBoat"

1. **Verifica credenciales email**:
   ```bash
   # Revisa que estas variables estén configuradas
   EMAIL_USER=sales@nadakiexcursions.com
   EMAIL_PASSWORD=***
   ```

2. **Forzar sincronización manual**:
   - Ve a `/messages.html`
   - Tab "Ingest Manual"
   - Click "Sync Now"

3. **Verifica configuración GetMyBoat**:
   - Asegúrate que `sales@nadakiexcursions.com` esté configurado
   - Revisa carpeta de spam en Outlook

### "Los emails no se detectan como GetMyBoat"

Verifica que los emails vengan de:
- `@getmyboat.com`
- `noreply@getmyboat.com`
- Asunto contiene "GetMyBoat"

---

## 📞 Soporte

### GetMyBoat
- 📧 support@getmyboat.com
- 📞 +1 (818) 927-2148 (24/7)
- 💼 sales@getmyboat.com (account managers)

### Sistema Nadaki
- Centro de mensajes: `/messages.html`
- Dashboard: `/dashboard.html`
- Mantenimiento: `/boat-maintenance.html`

---

## ✅ Checklist de Implementación

- [✅] Sistema detecta emails de GetMyBoat
- [✅] GetMyBoat aparece en plataformas
- [✅] Centro de mensajes funcional
- [ ] Configurar credenciales email (si no está ya)
- [ ] Configurar notificaciones en GetMyBoat.com
- [ ] Descargar app móvil GetMyBoat
- [ ] Activar SMS notifications
- [ ] Probar flujo completo con una reserva

---

## 🎓 Próximos Pasos Recomendados

1. **Hoy**: Configura notificaciones en GetMyBoat → sales@nadakiexcursions.com
2. **Hoy**: Descarga app móvil para alertas inmediatas
3. **Mañana**: Prueba con una consulta real
4. **Próxima semana**: Monitorea tiempo de respuesta y ajusta workflow

---

**¡Tu sistema ya está listo para GetMyBoat! 🚤**

Todos los emails de GetMyBoat que lleguen a `sales@nadakiexcursions.com` aparecerán automáticamente en tu Centro de Mensajes cada 2 minutos.
