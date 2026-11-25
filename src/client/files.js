import {HTTP_BASE} from '../../lib/protocol.js';
import React from "react";
import {h,ui,api,useT,formatError,FileGlyph,NativeIcon} from "./shared.js";
import {fileParentTarget} from './ui-pure.js';
import {formatFileSize,fileEntryPath,fileDirectory,fileViewState} from './files-model.js';
export const messages = {
  zh: { 'files.root': '工作区', 'files.location': '当前位置', 'files.empty': '此目录为空', 'files.failed': '无法读取远端文件',
    'files.retry': '重试读取', 'files.modified': '未保存', 'files.saved': '已保存', 'files.items': '{count} 项',
    'files.truncated': '仅显示前 2000 项，请进入子目录继续浏览。', 'files.imageFailed': '图片预览加载失败，可尝试刷新或下载。' },
  en: { 'files.root': 'Workspace', 'files.location': 'Current location', 'files.empty': 'This directory is empty', 'files.failed': 'Could not read remote files',
    'files.retry': 'Retry loading', 'files.modified': 'Unsaved', 'files.saved': 'Saved', 'files.items': '{count} items',
    'files.truncated': 'Showing the first 2,000 entries. Open a subdirectory to browse further.', 'files.imageFailed': 'Image preview could not load. Try refreshing or downloading.' },
};
function FileActionIcon({kind}) { return h(NativeIcon,{name:kind==='up'?'chevron-up':kind,size:15}); }
const remoteFileEditors = new Map();
export function assertFileCloseAllowed(sessionId, tab) {
  const editor = remoteFileEditors.get(`${sessionId}:${tab.id}`);
  if (editor?.blocked) { editor.notify(); throw new Error("Save or discard changes before closing this file tab"); }
}

export function remoteFileUrl(sessionId, path, inline) {
  return HTTP_BASE + "/session-download?sessionId=" + encodeURIComponent(sessionId) +
    "&path=" + encodeURIComponent(path) + (inline ? "&inline=1" : "");
}

export function RemoteFilesSidebar(props) {
  var t = useT();
  var sid = String(props.sessionId || "");
  var tabInfo = props.useTabInfo();
  var navigation = tabInfo && tabInfo.tab && tabInfo.tab.navigation;
  var [dir, setDir] = React.useState(".");
  var [entries, setEntries] = React.useState([]);
  var [loaded, setLoaded] = React.useState(false);
  var [truncated, setTruncated] = React.useState(false);
  var [remotePath, setRemotePath] = React.useState("");
  var lastRequest = React.useRef({path:".",read:false});
  var [preview, setPreview] = React.useState(null);
  var [content, setContent] = React.useState("");
  var [busy, setBusy] = React.useState(false);
  var [error, setError] = React.useState("");
  var [uploadPending, setUploadPending] = React.useState(null);
  var generation = React.useRef(0);
  var fileRef = React.useRef(null);
  var operationRef = React.useRef("");
  var editorKey = sid + ":" + String(tabInfo && tabInfo.tab && tabInfo.tab.id || "");
  var dirty = preview && !preview.binary && content !== preview.content;
  React.useLayoutEffect(function () {
    remoteFileEditors.set(editorKey, { blocked: !!dirty || operationRef.current === "write" || operationRef.current === "upload",
      notify: function () { setError(t("acp.unsavedFile")); } });
    return function () { remoteFileEditors.delete(editorKey); };
  }, [editorKey, dirty, busy]);
  React.useEffect(function () {
    if (!dirty) return;
    function preventUnload(event) { event.preventDefault(); event.returnValue = ""; }
    window.addEventListener("beforeunload", preventUnload);
    return function () { window.removeEventListener("beforeunload", preventUnload); };
  }, [dirty]);
  function load(path, read) {
    if (operationRef.current === "write" || operationRef.current === "upload") { setError(t("acp.fileSaving")); return; }
    if (dirty) { setError(t("acp.unsavedFile")); return; }
    lastRequest.current = {path:path || ".",read:!!read};
    var version = ++generation.current;
    setBusy(true); setError("");
    api("sessionFiles", { sessionId: sid, action: read ? "read" : "list", path: path || "." }).then(function (r) {
      if (version !== generation.current) return;
      setBusy(false);
      if (!r || !r.ok) {
        if (read && r?.code === 'file_too_large') { setDir(fileDirectory(path)); setRemotePath(''); setPreview({ path, binary: true, tooLarge: true }); setContent(''); return; }
        setError(formatError(r, t("agents.detectFailed"))); return;
      }
      setRemotePath(r.remotePath || "");
      if (read) {
        var file = Object.assign({}, r, { path: path, content: String(r.content || ""), viewRevision:version });
        setDir(fileDirectory(path));
        setPreview(file); setContent(file.content);
      } else {
        setDir(path || "."); setEntries(r.entries || []); setLoaded(true); setTruncated(!!r.truncated); setPreview(null); setContent("");
      }
    });
  }
  React.useEffect(function () {
    var path = navigation && navigation.params && navigation.params.path;
    load(path || ".", !!path);
  }, [sid, navigation && navigation.revision]);
  React.useEffect(function () { return function () { generation.current++; }; }, [sid]);
  function save() {
    if (!preview || !dirty || operationRef.current) return;
    operationRef.current = "write";
    var version = ++generation.current;
    setBusy(true); setError("");
    api("sessionFiles", { sessionId: sid, action: "write", path: preview.path,
      content: content, expectedVersion: preview.version }).then(function (r) {
      if (version !== generation.current) return;
      operationRef.current = ""; setBusy(false);
      if (!r || !r.ok) { setError(formatError(r, t("acp.fileConflict"))); return; }
      setPreview(Object.assign({}, preview, r, { path: preview.path, content: content }));
    });
  }
  function upload(file, overwrite) {
    if (!file || busy || dirty) return;
    if (!overwrite && entries.some(function (entry) { return entry.name === file.name; })) {
      setUploadPending(file); return;
    }
    if (operationRef.current) return;
    operationRef.current = "upload";
    setUploadPending(null);
    var path = fileEntryPath(dir, file.name);
    var version = ++generation.current;
    setBusy(true); setError("");
    fetch(HTTP_BASE + "/session-upload?sessionId=" + encodeURIComponent(sid) + "&path=" + encodeURIComponent(path) +
      (overwrite ? "&overwrite=true" : ""), {
      method: "POST", body: file, headers: { "x-requested-with": "XMLHttpRequest" }
    }).then(function (response) { return response.json(); }).then(function (result) {
      if (version !== generation.current) return;
      operationRef.current = ""; setBusy(false);
      if (!result || !result.ok) { setError(formatError(result, t("agents.upload"))); return; }
      load(dir, false);
    }).catch(function (err) {
      if (version !== generation.current) return;
      operationRef.current = ""; setBusy(false); setError(String(err.message || err));
    });
  }
  const view = fileViewState({busy,loaded,preview,entries,error});
  const location = preview ? preview.path : dir;
  const displayPath = (remotePath || location).replace(/^\.\//, '');
  const leafStart = displayPath.lastIndexOf('/') + 1;
  const parent = fileParentTarget(dir, preview?.path);
  const action = (kind, label, onClick, disabled = busy || dirty) => h(ui.Button, {
    variant:'ghost', size:'sm', className:'rssh-files-tool', title:label, 'aria-label':label, disabled, onClick,
  }, h(FileActionIcon,{kind}));
  const empty = label => h('div',{className:'rssh-files-empty'},
    busy ? h(ui.StateDot,{state:'ongoing'}) : h(FileGlyph,{directory:!preview,name:preview?.path||dir}), h('p',null,label));
  return h("section", { className: "rssh-session-files", "aria-label": t("agents.filesTitle"), 'aria-busy':busy },
    h('div',{className:'rssh-files-toolbar'},
      h('nav',{className:'rssh-files-location','aria-label':t('files.location')},
        h(ui.Button,{variant:'ghost',size:'sm',className:'rssh-files-root',title:t('files.root'),'aria-label':t('files.root'),disabled:busy||dirty||location==='.',onClick:()=>load('.',false)},
          h(FileGlyph,{directory:true,name:''}),h('span',{className:'rssh-files-root-label'},t('files.root'))),
        location!=='.' ? h('span',{'aria-hidden':true},'/') : null,
        location!=='.' ? h('span',{className:'rssh-files-path',title:displayPath,'aria-current':'page'},
          h('span',{className:'rssh-files-path-parent'},displayPath.slice(0,leafStart)),h('span',{className:'rssh-files-path-leaf'},displayPath.slice(leafStart))) : null),
      h('div',{className:'rssh-files-tools'},
        action('refresh',t('agents.refresh'),()=>load(preview?preview.path:dir,!!preview)),
        action('up',t('agents.parent'),()=>load(parent,false),busy||dirty||parent===null),
        action('upload',t('agents.upload'),()=>fileRef.current.click()))),
    h("input", { ref: fileRef, type: "file", hidden: true, onChange: function (e) {
      var file = e.target.files && e.target.files[0]; e.target.value = ""; upload(file, false);
    } }),
    error ? h('div',{role:'alert',className:'rssh-files-feedback'},h('span',null,error),
      !dirty ? h(ui.Button,{size:'sm',variant:'ghost',disabled:busy,onClick:()=>load(lastRequest.current.path,lastRequest.current.read)},t('files.retry')) : null) : null,
    view==='preview' ? h('div',{className:'rssh-file-document'},
      h('div',{className:'rssh-files-document-bar'},
        h('span',{className:'rssh-files-document-meta'},
          dirty ? h('span',{className:'rssh-files-dirty'},t('files.modified')) : formatFileSize(preview.size)),
        h('div',{className:'rssh-files-document-actions'},
          !preview.binary ? h(ui.Button,{variant:dirty?'primary':'ghost',size:'sm',disabled:busy||!dirty,onClick:save},t('acp.saveFile')) : null,
          dirty ? h(ui.Button,{variant:'ghost',size:'sm',disabled:busy,onClick:()=>setContent(preview.content)},t('acp.discardFile')) : null,
          h('a',{className:'rssh-native-button rssh-native-button-sm rssh-native-button-ghost rssh-files-tool','data-variant':'ghost',href:remoteFileUrl(sid,preview.path,false),download:'',title:t('agents.download'),'aria-label':t('agents.download')},h(FileActionIcon,{kind:'download'})))),
      preview.binary
        ? (!preview.tooLarge && /\.(png|jpe?g|gif|webp)$/i.test(preview.path)
          ? h('div',{className:'rssh-files-image-view'},h('img',{key:preview.viewRevision,className:'rssh-files-image',src:remoteFileUrl(sid,preview.path,true),alt:preview.path,onError:()=>setError(t('files.imageFailed'))}))
          : empty(t(preview.tooLarge?'acp.previewTooLarge':'agents.binary')))
        : h('textarea',{className:'rssh-file-editor',value:content,readOnly:busy,'aria-label':preview.path,spellCheck:false,wrap:'off',onChange:event=>setContent(event.target.value)}))
      : view==='loading' ? empty(t('agents.loading'))
      : view==='error' ? empty(t('files.failed'))
      : view==='empty' ? empty(t('files.empty'))
      : h('div',{className:'rssh-files-list','aria-label':t('agents.filesTitle')},entries.map(entry=>{
        const path=fileEntryPath(dir,entry.name);
        return h(ui.Button,{key:entry.name,variant:'ghost',className:'rssh-files-row',title:entry.name,disabled:busy,onClick:()=>load(path,entry.type!=='directory')},
          h('span',{className:'rssh-files-glyph'},h(FileGlyph,{directory:entry.type==='directory',name:entry.name})),
          h('span',{className:'rssh-files-name'},entry.name),entry.type==='file'?h('span',{className:'rssh-files-size'},formatFileSize(entry.size)):null);
      })),
    h('div',{className:'rssh-files-footer',role:'status'},
      busy ? h(React.Fragment,null,h(ui.StateDot,{state:'ongoing'}),t(operationRef.current?'acp.fileSaving':'agents.loading'))
        : preview ? (dirty?t('files.modified'):preview.binary?'':t('files.saved'))
        : loaded ? (truncated?t('files.truncated'):t('files.items',{count:entries.length})) : ''),
    uploadPending ? h(ui.Modal, { open: true, title: t("acp.overwriteFile"), closeLabel: t("acp.close"),
      onClose: function () { setUploadPending(null); }, footer: h(React.Fragment, null,
        h(ui.Button, { variant: "outline", onClick: function () { setUploadPending(null); } }, t("acp.close")),
        h(ui.Button, { variant: "primary", onClick: function () { upload(uploadPending, true); } }, t("acp.overwriteFile")))
    }, uploadPending.name) : null
  );
}
