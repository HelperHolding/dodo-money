# Flujo obligatorio de cambios

- Todo cambio se prepara en una rama y se integra mediante pull request hacia `main`.
- No hacer commits ni pushes directos a `main`, tampoco para despliegues o correcciones pequeñas.
- No crear commits vacíos ni usar `--allow-empty` para disparar un redeploy. Para repetir un despliegue, usar el mecanismo de redeploy de Vercel sobre un commit existente.
- No omitir hooks ni controles de CI para publicar. Ejecutar `npm run hooks:install` en cada clon nuevo.
- Antes de integrar, deben pasar `Historial válido` y `Pruebas y tipos`, además de las comprobaciones aplicables al cambio. Revisar el diff completo del PR.
- Las migraciones y correcciones de producción se entregan para ejecución de Sebastián y requieren su resultado antes de publicar el formulario dependiente.
- Conservar cambios locales y archivos no versionados de otras sesiones. No sobrescribirlos al actualizar la rama.
- Las pruebas de los controles Git pueden construir historiales inválidos únicamente en repositorios temporales aislados; nunca en este repositorio ni publicarlos.
