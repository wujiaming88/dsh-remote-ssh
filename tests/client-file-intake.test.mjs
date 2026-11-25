import test from 'node:test';
import assert from 'node:assert/strict';
import {Blob, File} from 'node:buffer';
import {readFileSync} from 'node:fs';
import {parse} from 'acorn';
import {transform} from 'esbuild';
import {prepareFileAttachments, MAX_ATTACHMENTS, MAX_TEXT_BYTES, MAX_IMAGE_BYTES, MAX_FILE_BYTES, MAX_BINARY_BYTES} from '../src/client/file-intake.js';
import en from '../src/client/en.js';
import zh from '../src/client/zh.js';

const capabilities = {promptCapabilities: {image: true}};
const makeFile = (name, type = '', parts = ['content']) => new File(parts, name, {type});
const prepare = (files, existing = [], caps = capabilities, options) => prepareFileAttachments(files, existing, caps, options);
const rejectsCode = (promise, code) => assert.rejects(promise, error => error instanceof Error && error.code === code);
const read = name => readFileSync(new URL('../src/client/' + name, import.meta.url), 'utf8');
const binary64 = makeFile('large.zip', 'application/zip', [new Uint8Array(MAX_FILE_BYTES)]);
const noRead = file => {
  for (const method of ['arrayBuffer', 'text', 'stream']) Object.defineProperty(file, method, {value() { throw new Error('Binary content must not be read'); }});
  return file;
};

test('mixed ZIP, PDF, Office, SVG and empty MIME are opaque upload attachments', async () => {
  const files = [
    makeFile('archive.zip', 'application/zip'),
    makeFile('document.pdf', 'application/pdf'),
    makeFile('report.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'),
    makeFile('sheet.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'),
    makeFile('slides.pptx', 'application/vnd.openxmlformats-officedocument.presentationml.presentation'),
    makeFile('drawing.svg', 'image/svg+xml', ['<svg></svg>']),
    makeFile('unknown.bin'),
  ].map(noRead);
  let n = 0;
  const attachments = await prepare(files, [], {}, {makeId: () => `upload-${++n}`});
  assert.equal(attachments.length, files.length);
  attachments.forEach((attachment, index) => {
    assert.deepEqual(attachment, {id: `upload-${index + 1}`, uploadId: `upload-${index + 1}`, type: 'file_upload', name: files[index].name,
      mimeType: files[index].type || 'application/octet-stream', size: files[index].size, file: files[index]});
    assert.equal(attachment.data, undefined);
    assert.equal(attachment.text, undefined);
    assert.equal(attachment.path, undefined);
  });
});

test('real unnamed Blob and zero-byte File are valid without content reads', async () => {
  const blob = noRead(new Blob([], {type: 'application/octet-stream'}));
  const empty = noRead(makeFile('empty.zip', '', []));
  const result = await prepare([blob, empty], [], {});
  assert.equal(result[0].file, blob);
  assert.equal(result[0].name, 'attachment');
  assert.equal(result[1].file, empty);
  assert.equal(result[1].size, 0);
});

test('64 MiB is inclusive and 64 MiB plus one byte is rejected', async () => {
  const [attachment] = await prepare([binary64]);
  assert.equal(attachment.size, MAX_FILE_BYTES);
  const oversized = noRead(makeFile('large.zip', 'application/zip', [binary64, new Uint8Array(1)]));
  await rejectsCode(prepare([oversized]), 'attachmentFileTooLarge');
});

test('256 MiB binary total includes existing uploads and has an inclusive boundary', async () => {
  assert.equal(MAX_BINARY_BYTES, 4 * MAX_FILE_BYTES);
  const result = await prepare([binary64, binary64, binary64, binary64]);
  assert.equal(result.length, 4);
  await rejectsCode(prepare([makeFile('one.bin', '', ['a'])], result), 'attachmentBatchTooLarge');
  await rejectsCode(prepare([binary64, binary64, binary64, binary64, makeFile('one.bin', '', ['a'])]), 'attachmentBatchTooLarge');
  assert.equal((await prepare([makeFile('empty.bin', '', [])], result)).length, 1);
});

test('all attachment kinds count towards the inclusive 16-attachment limit before reads', async () => {
  const existing = [{id: 'remote', path: 'remote.txt'}, {id: 'text', text: 'hello'}, {id: 'image', type: 'image', data: 'YQ=='}];
  const files = Array.from({length: MAX_ATTACHMENTS - existing.length}, () => makeFile('same.zip'));
  const result = await prepare(files, existing);
  assert.equal(result.length, 13);
  await rejectsCode(prepare([...files, noRead(makeFile('unread.txt', 'text/plain'))], existing), 'attachmentCountExceeded');
});

test('invalid entries and directory metadata are rejected, not converted into empty files', async () => {
  const spoof = {name: 'fake.zip', type: '', size: 0, arrayBuffer() {}, text() {}, slice() {}};
  for (const entry of [null, {}, spoof, {kind: 'directory'}, {isDirectory: true}, makeFile('folder', 'inode/directory'), makeFile('folder', 'application/x-directory')]) {
    await rejectsCode(prepare([entry]), 'attachmentInvalidFile');
  }
  const directory = makeFile('folder');
  Object.defineProperty(directory, 'isDirectory', {value: true});
  await rejectsCode(prepare([directory]), 'attachmentInvalidFile');
  await rejectsCode(prepare([makeFile('')]), 'attachmentInvalidFile');
});

test('same names get distinct IDs and uploadIds; names are never interpreted as paths', async () => {
  const file = makeFile('../a folder/同名.zip', 'application/zip');
  const existing = Object.freeze([{id: 'old', text: 'old'}]);
  const result = await prepare([file, file], existing);
  assert.notEqual(result[0].id, result[1].id);
  for (const attachment of result) {
    assert.equal(attachment.id, attachment.uploadId);
    assert.equal(attachment.name, file.name);
    assert.equal(attachment.path, undefined);
  }
  assert.equal(existing.length, 1);
  assert.equal(result.length, 2);
});

test('text MIME and every existing extension retain the text-only wire shape', async () => {
  const suffixes = ['md', 'txt', 'json', 'yaml', 'yml', 'csv', 'js', 'mjs', 'cjs', 'jsx', 'mjsx', 'cjsx', 'ts', 'tsx', 'py', 'go', 'rs', 'java', 'sh', 'sql', 'css', 'html'];
  for (const suffix of suffixes) {
    const [attachment] = await prepare([makeFile(`file.${suffix.toUpperCase()}`, '', ['hello 世界'])], [], {}, {makeId: () => 'id'});
    assert.deepEqual(attachment, {id: 'id', name: `file.${suffix.toUpperCase()}`, mimeType: 'text/plain', text: 'hello 世界'});
  }
  const [attachment] = await prepare([makeFile('arbitrary.data', 'text/custom', ['\u0000normal text'])]);
  assert.equal(attachment.text, '\u0000normal text');
  assert.equal(attachment.mimeType, 'text/custom');
});

test('text limits count UTF-8 bytes across existing and newly selected files', async () => {
  const full = makeFile('full.txt', 'text/plain', ['a'.repeat(MAX_TEXT_BYTES)]);
  const result = await prepare([full]);
  assert.equal(result[0].text.length, MAX_TEXT_BYTES);
  await rejectsCode(prepare([makeFile('extra.txt', 'text/plain', ['a'])], result), 'attachmentTextTooLarge');
  await rejectsCode(prepare([makeFile('too-big.txt', '', ['a'.repeat(MAX_TEXT_BYTES + 1)])]), 'attachmentTextTooLarge');
  const existing = [{id: 'text', text: 'a'.repeat(MAX_TEXT_BYTES - 2)}];
  await rejectsCode(prepare([makeFile('unicode.txt', '', ['世'])], existing), 'attachmentTextTooLarge');
  assert.equal((await prepare([makeFile('ascii.txt', '', ['aa'])], existing)).length, 1);
});

test('text aggregate preserves the original BOM-decoding behavior', async () => {
  const half = 'a'.repeat(MAX_TEXT_BYTES / 2);
  const files = [makeFile('a.txt', '', ['\uFEFF', half]), makeFile('b.txt', '', ['\uFEFF', half])];
  const result = await prepare(files);
  assert.equal(result[0].text, half);
  assert.equal(result[1].text, half);
});

test('post-decoding UTF-8 expansion is included in text limit checks', async () => {
  const file = makeFile('malformed.txt', 'text/plain', [new Uint8Array([255])]);
  await rejectsCode(prepare([file], [{id: 'text', text: 'a'.repeat(MAX_TEXT_BYTES - 2)}]), 'attachmentTextTooLarge');
});

test('PNG JPEG WebP GIF preserve their exact base64 data and image wire shape', async () => {
  const bytes = new Uint8Array([0, 1, 127, 128, 255]);
  for (const mimeType of ['image/png', 'image/jpeg', 'image/webp', 'image/gif']) {
    const [attachment] = await prepare([makeFile('image', mimeType, [bytes])], [], capabilities, {makeId: () => 'image'});
    assert.deepEqual(attachment, {id: 'image', type: 'image', name: 'image', mimeType, data: Buffer.from(bytes).toString('base64')});
  }
  const [otherImage] = await prepare([noRead(makeFile('image.avif', 'image/avif'))], [], {});
  assert.equal(otherImage.type, 'file_upload');
});

test('image capability is required before content is read', async () => {
  for (const caps of [{}, {promptCapabilities: {image: false}}, null]) {
    await rejectsCode(prepare([noRead(makeFile('image.png', 'image/png'))], [], caps), 'attachmentUnsupported');
  }
});

test('2 MiB image total is inclusive and includes existing base64 data', async () => {
  const full = makeFile('image.png', 'image/png', [new Uint8Array(MAX_IMAGE_BYTES)]);
  const result = await prepare([full]);
  assert.equal(Buffer.from(result[0].data, 'base64').length, MAX_IMAGE_BYTES);
  await rejectsCode(prepare([makeFile('one.png', 'image/png', ['a'])], result), 'attachmentImageTooLarge');
  await rejectsCode(prepare([makeFile('large.png', 'image/png', [full, 'a'])]), 'attachmentImageTooLarge');
  await rejectsCode(prepare([noRead(makeFile('full.png', 'image/png', [full])), makeFile('extra.gif', 'image/gif', ['a'])]), 'attachmentImageTooLarge');
});

test('mixed text, image and binary budgets remain independent', async () => {
  const files = [makeFile('full.txt', '', ['a'.repeat(MAX_TEXT_BYTES)]), makeFile('full.png', 'image/png', [new Uint8Array(MAX_IMAGE_BYTES)]), binary64];
  const result = await prepare(files);
  assert.equal(result.length, 3);
  assert.equal(result[2].file, binary64);
});

test('a failing batch returns no partial attachments, allocates no IDs and preserves the existing draft', async () => {
  const existing = Object.freeze([Object.freeze({id: 'old', text: 'draft'})]);
  let ids = 0;
  const options = {makeId: () => `new-${++ids}`};
  const broken = makeFile('broken.txt', 'text/plain');
  Object.defineProperty(broken, 'text', {value: async () => { throw new Error('disk failed'); }});
  await rejectsCode(prepare([makeFile('good.zip'), makeFile('good.txt'), broken], existing, capabilities, options), 'attachmentReadFailed');
  assert.equal(ids, 0);
  assert.deepEqual(existing, [{id: 'old', text: 'draft'}]);
  await rejectsCode(prepare([noRead(makeFile('good.txt')), makeFile('invalid.zip', '', [binary64, 'a'])], existing), 'attachmentFileTooLarge');
});

test('all stable intake codes and upload feedback have English and Chinese labels', () => {
  const codes = ['attachmentInvalidFile', 'attachmentCountExceeded', 'attachmentTextTooLarge', 'attachmentImageTooLarge', 'attachmentUnsupported', 'attachmentFileTooLarge', 'attachmentBatchTooLarge', 'attachmentReadFailed'];
  const labels = ['fileUploadPending', 'fileUploadUploading', 'fileUploadUploaded', 'fileUploadFailed', 'fileUploadHint'];
  for (const locale of [en, zh]) for (const code of [...codes, ...labels]) assert.ok(locale[`acp.${code}`], code);
  assert.match(en['acp.fileUploadHint'], /does not delete/);
  assert.match(zh['acp.fileUploadHint'], /不会删除/);
});

test('upload cards reuse native icons/state indicators with stable identity and no fake progress or local preview', async () => {
  const source = read('attachments.js'), css = read('attachments.css');
  parse(source, {ecmaVersion: 'latest', sourceType: 'module'});
  assert.match(source, /AttachmentList\(\{attachments,uploads=\{\}/);
  assert.match(source, /upload:uploads\[file.uploadId\]/);
  assert.match(source, /h\(ui.FileTypeIcon/);
  assert.match(source, /h\(ui.StateDot/);
  assert.match(source, /className:'rssh-attachment-remove',disabled:sending/);
  assert.match(source, /fileUploadHint/);
  assert.match(source, /role:'status',title:detail/);
  assert.match(css, /padding: 0 30px 0 12px/);
  assert.match(css, /\.rssh-attachment-file \{ padding-right: 42px/);
  assert.equal((await transform(css, {loader: 'css'})).warnings.length, 0);
  const ast = parse(source, {ecmaVersion: 'latest', sourceType: 'module'});
  const node = ast.body.find(node => node.type === 'FunctionDeclaration' && node.id.name === 'FileAttachment');
  assert.doesNotMatch(source.slice(node.start, node.end), /onClick|preview|percent|progressbar|fetch\(/i);
  assert.doesNotMatch(read('file-intake.js'), /fetch\(|FileReader|localStorage|sessionStorage/);
});
