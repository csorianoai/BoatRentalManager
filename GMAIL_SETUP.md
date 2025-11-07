# Configuración de Gmail para Nadaki Portal

## Estado Actual
- ❌ Error: "Invalid credentials (Failure)" con Gmail IMAP
- ✅ Configuración correcta: imap.gmail.com:993
- ✅ EMAIL_USER: nadakiportal@gmail.com
- ✅ EMAIL_PASSWORD configurado en Replit Secrets

## Pasos para Resolver el Error de Credenciales

### Paso 1: Verificar que 2FA esté Activada
1. Ve a: https://myaccount.google.com/security
2. Busca "Verificación en dos pasos"
3. **DEBE estar ACTIVADA** - las App Passwords solo funcionan con 2FA activa

### Paso 2: Habilitar IMAP en Gmail
1. Ve a: https://mail.google.com/mail/u/0/#settings/fwdandpop
2. En la sección "IMAP Access", selecciona **"Habilitar IMAP"**
3. Haz clic en "Guardar cambios" al final de la página

### Paso 3: Generar Nueva App Password
1. Ve a: https://myaccount.google.com/apppasswords
2. Si ves contraseñas antiguas de "Nadaki Portal", **elimínalas todas**
3. Haz clic en "Crear" o el botón "+"
4. Nombre sugerido: **"Nadaki Portal IMAP"**
5. Gmail generará una contraseña de 16 caracteres en este formato:
   ```
   abcd efgh ijkl mnop
   ```
6. **IMPORTANTE**: Copia la contraseña y **QUITA TODOS LOS ESPACIOS**:
   ```
   abcdefghijklmnop
   ```

### Paso 4: Actualizar Credenciales en Replit
1. En Replit, ve a "Secrets" (el candado en la barra lateral)
2. Busca el secret **EMAIL_PASSWORD**
3. Haz clic en "Edit" o el icono de lápiz
4. Pega la nueva App Password **SIN ESPACIOS** (16 caracteres)
5. Haz clic en "Save"

### Paso 5: Reiniciar el Portal
El portal se reiniciará automáticamente al guardar el secret. Espera unos 2 minutos y verifica en los logs:
- ✅ Éxito: "📧 Email sync completed"
- ❌ Error: "Invalid credentials (Failure)"

## Verificación de Seguridad de Google

Si el error persiste después de seguir todos los pasos:

### Opción 1: Revisar Intentos de Inicio de Sesión Bloqueados
1. Ve a: https://myaccount.google.com/notifications
2. Busca alertas de seguridad recientes
3. Si hay intentos bloqueados de "aplicación menos segura", apruébalos

### Opción 2: Revisar Acceso de Aplicaciones
1. Ve a: https://myaccount.google.com/permissions
2. Verifica que no haya aplicaciones bloqueadas
3. Si ves "Nadaki Portal" o similar bloqueado, permítelo

### Opción 3: Menos Probable - Acceso de Aplicaciones Menos Seguras
**Nota**: Esto NO debería ser necesario con App Passwords, pero si nada más funciona:
1. Ve a: https://myaccount.google.com/lesssecureapps
2. **Desactívalo** (debe estar OFF cuando usas App Passwords)
3. Si está activado, desactívalo y regenera la App Password

## Formato Correcto de Credenciales

En Replit Secrets, los valores deben ser:

```
EMAIL_USER: nadakiportal@gmail.com
EMAIL_PASSWORD: qbdrtwiqvyvtuiek (16 caracteres, SIN espacios)
EMAIL_IMAP_HOST: imap.gmail.com
EMAIL_IMAP_PORT: 993
```

## Configuración de Reenvío de Emails

Una vez que funcione la conexión IMAP:

1. En Outlook/GoDaddy (sales@nadakiexcursions.com):
   - Configura reenvío automático a: nadakiportal@gmail.com
   - Mantén una copia en la bandeja de entrada original

2. El portal sincronizará emails automáticamente cada 2 minutos

## Resolución de Problemas

### Error: "Invalid credentials (Failure)"
- Verifica que la App Password esté correctamente copiada (16 caracteres, sin espacios)
- Asegúrate que 2FA esté activa en la cuenta de Gmail
- Verifica que IMAP esté habilitado en Gmail
- Regenera la App Password y actualiza el secret

### Error: "Connection timeout"
- Verifica que el puerto sea 993 (no 143)
- Verifica que el host sea imap.gmail.com

### Emails no aparecen en el portal
- Verifica que el reenvío esté configurado correctamente
- Revisa los logs del servidor para ver si hay errores
- Verifica que los emails lleguen a nadakiportal@gmail.com primero

## Prueba Manual de Conexión

Para probar manualmente la conexión IMAP:

```bash
# Endpoint de prueba (solo desarrollo)
curl http://localhost:5000/api/messages/sync-now
```

Esto forzará una sincronización inmediata y mostrará errores en los logs.
