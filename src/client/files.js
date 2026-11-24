import {HTTP_BASE} from '../../lib/protocol.js';
import React from "react";
import {h,ui,api,useT,formatError,FileGlyph} from "./shared.js";
import {fileParentTarget} from './ui-pure.js';
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
    var version = ++generation.current;
    setBusy(true); setError("");
    api("sessionFiles", { sessionId: sid, action: read ? "read" : "list", path: path || "." }).then(function (r) {
      if (version !== generation.current) return;
      setBusy(false);
      if (!r || !r.ok) {
        if (read && r?.code === 'file_too_large') { setPreview({ path, binary: true, tooLarge: true }); setContent(''); return; }
        setError(formatError(r, t("agents.detectFailed"))); return;
      }
      if (read) {
        var file = Object.assign({}, r, { path: path, content: String(r.content || "") });
        setDir(path.includes('/') ? path.slice(0, path.lastIndexOf('/')) || '.' : '.');
        setPreview(file); setContent(file.content);
      } else {
        setDir(path || "."); setEntries(r.entries || []); setPreview(null); setContent("");
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
    if (!file) return;
    if (!overwrite && entries.some(function (entry) { return entry.name === file.name; })) {
      setUploadPending(file); return;
    }
    if (operationRef.current) return;
    operationRef.current = "upload";
    setUploadPending(null);
    var path = (dir === "." ? "" : dir.replace(/\/$/, "") + "/") + file.name;
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
  return h("section", { className: "rssh-session-files", "aria-label": t("agents.filesTitle") },
    h("div", { className: "ra-file-actions" },
      h("span", { className: "ra-acp-role" }, preview ? preview.path : dir),
      h(ui.Button, { variant: "ghost", size: "sm", disabled: busy || dirty, onClick: function () { load(preview ? preview.path : dir, !!preview); } }, t("agents.refresh")),
      h(ui.Button, { variant: "ghost", size: "sm", disabled: busy || dirty || fileParentTarget(dir, preview?.path) === null, onClick: function () {
        load(fileParentTarget(dir, preview?.path), false);
      } }, t("agents.parent")),
      h(ui.Button, { variant: "outline", size: "sm", disabled: busy || dirty, onClick: function () { fileRef.current.click(); } }, t("agents.upload"))
    ),
    h("input", { ref: fileRef, type: "file", hidden: true, onChange: function (e) {
      var file = e.target.files && e.target.files[0]; e.target.value = ""; upload(file, false);
    } }),
    error ? h("p", { role: "alert", className: "ra-acp-error" }, error) : null,
    busy ? h("div", { role: "status" }, t("agents.loading")) : null,
    preview ? h("div", { className: "rssh-file-document" },
      h("div", { className: "ra-file-actions" },
        h("a", { className: "ra-download", href: remoteFileUrl(sid, preview.path, false), download: "" }, t("agents.download")),
        !preview.binary ? h(ui.Button, { variant: "primary", size: "sm", disabled: busy || !dirty, onClick: save }, t("acp.saveFile")) : null,
        dirty ? h(ui.Button, { variant: "ghost", size: "sm", onClick: function () { setContent(preview.content); } }, t("acp.discardFile")) : null
      ),
      preview.tooLarge ? h("p", { role: "status" }, t("acp.previewTooLarge")) : null,
      preview.binary
        ? (!preview.tooLarge && /\.(png|jpe?g|gif|webp)$/i.test(preview.path)
          ? h("img", { className: "ra-file-image", src: remoteFileUrl(sid, preview.path, true), alt: preview.path })
          : h("p", null, t("agents.binary")))
        : h("textarea", { className: "rssh-file-editor", value: content,
            "aria-label": preview.path, spellCheck: false, onChange: function (e) { setContent(e.target.value); } })
    ) : h("div", { className: "ra-file-list" }, entries.map(function (entry) {
      var path = (dir === "." ? "" : dir + "/") + entry.name;
      return h(ui.Button, { key: entry.name, variant: "ghost", className: "ra-file-row", disabled: busy,
        onClick: function () { load(path, entry.type !== "directory"); } },
        h(FileGlyph, { directory: entry.type === "directory", name: entry.name }), h("span", null, entry.name));
    })),
    uploadPending ? h(ui.Modal, { open: true, title: t("acp.overwriteFile"), closeLabel: t("acp.close"),
      onClose: function () { setUploadPending(null); }, footer: h(React.Fragment, null,
        h(ui.Button, { variant: "outline", onClick: function () { setUploadPending(null); } }, t("acp.close")),
        h(ui.Button, { variant: "primary", onClick: function () { upload(uploadPending, true); } }, t("acp.overwriteFile")))
    }, uploadPending.name) : null
  );
}
