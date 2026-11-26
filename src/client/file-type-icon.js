import {fileType} from './file-type-model.js';

/** Original 16px file glyph; generated locally, never loaded from a remote path. */
export function createFileTypeIcon(React) {
  const h = React.createElement;
  return function FileTypeIcon({path,size=16,className,style,...rest}={}) {
    const type=fileType(path);
    const pixel=Math.max(12,Number(size)||16);
    const label=type.label||'';
    return h('span',{...rest,className:['rssh-file-type-icon',className].filter(Boolean).join(' '),
      'aria-hidden':rest['aria-label']?undefined:true,role:rest['aria-label']?'img':undefined,
      style:{display:'inline-flex',flex:'none',width:pixel,height:pixel,color:type.color,...style}},
      h('svg',{viewBox:'0 0 16 16',width:pixel,height:pixel,'aria-hidden':true,focusable:'false'},
        h('path',{d:'M3.25 1.25h5.5l3 3v10.5h-8.5z',fill:'currentColor',opacity:.14}),
        h('path',{d:'M3.25 1.25h5.5l3 3v10.5h-8.5z',fill:'none',stroke:'currentColor',strokeWidth:1,strokeLinejoin:'round'}),
        h('path',{d:'M8.75 1.25v3h3',fill:'none',stroke:'currentColor',strokeWidth:1,strokeLinejoin:'round'}),
        label
          ? h('text',{x:8,y:12,textAnchor:'middle',fill:'currentColor',fontSize:label.length>2?4.2:6,
            fontFamily:'var(--ds-font-family-code, monospace)',fontWeight:700,paintOrder:'stroke',stroke:'var(--dsw-alias-bg-base)',strokeWidth:1.2},label)
          : h('path',{d:'M5.5 7.5h5M5.5 9.75h5M5.5 12h3.5',fill:'none',stroke:'currentColor',strokeWidth:1,strokeLinecap:'round'})));
  };
}
