import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';

interface MarkdownRendererProps {
  content: string;
}

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content }) => {
  return (
    // 'prose' というクラスが tailwind-typography の魔法です
    <div className="prose prose-sm md:prose-base w-full max-w-none break-words dark:prose-invert">
      <ReactMarkdown
        remarkPlugins={[remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={{
          a: ({ node, ...props }) => (
            <a {...props} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline" />
          ),
          code: ({ node, ...props }) => (
            <code {...props} className="bg-gray-100 text-red-500 rounded px-1 py-0.5 font-mono text-sm" />
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
};