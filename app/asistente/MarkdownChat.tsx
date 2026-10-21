import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type {FuenteIA} from '@/lib/ia/validacion';
import estilos from './chat.module.css';

/** No interpreta HTML ni imágenes. Los enlaces navegables proceden de las fuentes del servidor. */
export function MarkdownChat({texto,fuentes=[]}:{texto:string;fuentes?:FuenteIA[]}){
 const autorizadas=new Set(fuentes.map(f=>f.href));
 return <div className={estilos.markdown}><Markdown remarkPlugins={[remarkGfm]} skipHtml disallowedElements={['img']} components={{
  a:({href,children})=>href&&autorizadas.has(href)?<a href={href}>{children}</a>:<span>{children}</span>,
  table:({children})=><div className={estilos.tablaMarkdown} role="region" aria-label="Tabla de la respuesta" tabIndex={0}><table>{children}</table></div>,
 }}>{texto}</Markdown></div>;
}
