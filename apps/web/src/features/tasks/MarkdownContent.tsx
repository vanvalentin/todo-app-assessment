import type { ComponentPropsWithoutRef } from "react";
import ReactMarkdown, { type Components, type ExtraProps } from "react-markdown";
import remarkGfm from "remark-gfm";
import styles from "./MarkdownContent.module.scss";

/**
 * External links open in a new tab without handing the opener to the target page.
 * react-markdown also passes its hast `node`; it is dropped so it never reaches the DOM.
 */
function MarkdownLink(props: ComponentPropsWithoutRef<"a"> & ExtraProps) {
  const anchorProps: ComponentPropsWithoutRef<"a"> & ExtraProps = { ...props };
  delete anchorProps.node;
  return <a {...anchorProps} target="_blank" rel="noopener noreferrer nofollow" />;
}

/**
 * Markdown is rendered with raw HTML disabled: `skipHtml` drops embedded HTML
 * instead of escaping it into the page, and react-markdown's default URL transform
 * removes unsafe protocols such as `javascript:`. No `rehype-raw` is ever added.
 */
const components: Components = { a: MarkdownLink };

export function MarkdownContent({ source }: { readonly source: string }) {
  return (
    <div className={styles.markdown}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml components={components}>
        {source}
      </ReactMarkdown>
    </div>
  );
}
