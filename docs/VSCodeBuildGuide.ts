export const VSCODE_GUIDE = `
# Guía de Compilación e Integración (VS Code)

Esta guía explica cómo descargar este código, compilarlo localmente y usarlo en tu proyecto ASP.NET Razor Pages sin conflictos de estilos.

## Fase 1: Descarga y Configuración Local

1.  **Descargar Archivos**: Copia todos los archivos de este proyecto a una carpeta local (ej: \`my-logistics-widget\`).
2.  **Abrir en VS Code**: Abre esa carpeta.
3.  **Crear package.json**: Si no tienes uno, crea un archivo \`package.json\` en la raíz con esto:

\`\`\`json
{
  "name": "smart-logistics-widget",
  "version": "1.0.0",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build"
  },
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "@google/genai": "^0.1.0",
    "lucide-react": "^0.300.0"
  },
  "devDependencies": {
    "@types/react": "^18.2.0",
    "@types/react-dom": "^18.2.0",
    "@vitejs/plugin-react": "^4.2.0",
    "autoprefixer": "^10.4.0",
    "postcss": "^8.4.0",
    "tailwindcss": "^3.4.0",
    "typescript": "^5.2.0",
    "vite": "^5.0.0"
  }
}
\`\`\`

4.  **Instalar Dependencias**:
    Abre la terminal de VS Code y ejecuta:
    \`npm install\`

5.  **Compilar (Build)**:
    Ejecuta el comando:
    \`npm run build\`

    Esto creará una carpeta \`dist/\` con dos archivos importantes:
    *   \`smart-logistics.es.js\` (La lógica)
    *   \`smart-logistics.css\` (Los estilos)

---

## Fase 2: Integración en Razor Pages

Ahora vamos a integrar estos archivos en tu proyecto .NET.

1.  **Copiar Archivos**:
    Toma los dos archivos de \`dist/\` y cópialos a tu carpeta \`wwwroot/js/\` y \`wwwroot/css/\` en tu proyecto ASP.NET.

2.  **Editar tu \`_Layout.cshtml\` o la Página Específica**:
    Agrega la referencia al script. Nota que NO necesitamos agregar el CSS en el \`<head>\` principal (para evitar conflictos).

    \`\`\`html
    <!-- Al final del body -->
    <script src="~/js/smart-logistics.es.js" type="module"></script>
    \`\`\`

3.  **Usar el Web Component**:
    En la parte de tu HTML donde quieras que "viva" el widget (puede ser en el footer, no importa porque es un modal), agrega esto:

    \`\`\`html
    <!-- 
      css-src: Es la ruta donde pusiste el CSS. 
      El componente lo cargará DENTRO de su Shadow DOM para que no afecte tu sitio.
    -->
    <smart-logistics-widget 
        id="myLogisticsWidget" 
        css-src="/css/smart-logistics.css">
    </smart-logistics-widget>
    
    <!-- Tu Botón Existente en Razor -->
    <button class="btn btn-primary" onclick="openExtractor()">
        Abrir Extractor IA
    </button>

    <script>
        function openExtractor() {
            const widget = document.getElementById('myLogisticsWidget');
            // Llamamos al método público que expusimos en React
            widget.open();
        }
    </script>
    \`\`\`

## ¿Por qué esto es mejor?

1.  **Aislamiento Total (Shadow DOM)**: Al usar \`<smart-logistics-widget>\`, el navegador crea una barrera.
    *   Si tu sitio tiene \`h1 { color: red }\`, el widget NO se verá rojo.
    *   El CSS del widget (Tailwind) no reseteará los estilos de tus botones existentes.
2.  **Modularidad**: Es un solo bloque de código.
3.  **Performance**: El CSS solo se carga cuando el componente se inicia.
`;
