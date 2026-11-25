# Third-party notices

## DeepSeek Harness UI source adaptations

The local native UI adapters, SVG icon geometry, and associated view styling in
the local native UI modules, selected page styles, and the generated [client bundle](lib/client.js)
include material adapted from **DeepSeek Harness 0.2.2-rc.5**, distributed as
`@deepseek-ai/dsh-web-frontend` and the corresponding DSH UI packages.
The conversation view copies also use distributed TSX/CSS from
`@deepseek-ai/dsh-client-ui-chat`, `@deepseek-ai/dsh-client-ui-tool`,
`@deepseek-ai/dsh-client-ui-conversation`, and
`@deepseek-ai/dsh-client-ui-attachment` in that same installation.

Upstream: https://github.com/deepseek-ai/deepseek-harness

These are local adaptations, not an endorsement or a supported import of DSH's
internal Client modules. Source identification and adaptation boundaries are
recorded in the [native UI adaptation notes](docs/NATIVE_UI.md).

The following license is reproduced from the installed
`@deepseek-ai/dsh-web-frontend/LICENSE`:

MIT License

Copyright (c) 2026 DeepSeek

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
