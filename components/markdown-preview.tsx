"use client";

import ReactMarkdown, { defaultUrlTransform } from "react-markdown";
import remarkGfm from "remark-gfm";

const remarkPlugins = [remarkGfm];

export function MarkdownPreview({ markdown }: { markdown: string }) {
  return (
    <ReactMarkdown remarkPlugins={remarkPlugins} urlTransform={defaultUrlTransform}>
      {markdown}
    </ReactMarkdown>
  );
}
