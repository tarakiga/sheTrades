"use client";

import React, { useEffect, useRef, useState } from "react";
import { Button } from "./Button";

type RichTextEditorProps = {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  label?: string;
};

/**
 * Converts WhatsApp markdown to HTML.
 * *bold* -> <b>bold</b>
 * _italic_ -> <i>italic</i>
 * ~strike~ -> <s>strike</s>
 */
function markdownToHtml(md: string): string {
  if (!md) return "";
  let html = md;
  // Escape basic HTML
  html = html.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  // Replace Markdown with HTML tags
  html = html.replace(/\*(.*?)\*/g, "<b>$1</b>");
  html = html.replace(/_(.*?)_/g, "<i>$1</i>");
  html = html.replace(/~(.*?)~/g, "<s>$1</s>");
  // Replace newlines with <br>
  html = html.replace(/\n/g, "<br>");
  return html;
}

/**
 * Converts browser-generated HTML back to WhatsApp markdown.
 */
function htmlToMarkdown(html: string): string {
  if (!html) return "";
  let text = html;
  
  // Replace structural tags with newlines
  text = text.replace(/<br\s*\/?>/gi, "\n");
  text = text.replace(/<div[^>]*>/gi, "\n");
  text = text.replace(/<\/div>/gi, "");
  text = text.replace(/<p[^>]*>/gi, "");
  text = text.replace(/<\/p>/gi, "\n");
  
  // Replace formatting tags with markdown
  text = text.replace(/<(b|strong)[^>]*>(.*?)<\/\1>/gi, "*$2*");
  text = text.replace(/<(i|em)[^>]*>(.*?)<\/\1>/gi, "_$2_");
  text = text.replace(/<(s|strike|del)[^>]*>(.*?)<\/\1>/gi, "~$2~");
  
  // Strip remaining HTML tags
  text = text.replace(/<[^>]+>/g, "");
  
  // Decode HTML entities (e.g. &nbsp; -> space, &amp; -> &)
  // We use a temporary DOM element to decode safely in the browser.
  if (typeof document !== "undefined") {
    const doc = new DOMParser().parseFromString(text, "text/html");
    text = doc.documentElement.textContent || text;
  }
  
  return text;
}

export function RichTextEditor({ id, value, onChange, placeholder, label }: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const [isFocused, setIsFocused] = useState(false);

  // Sync external value to internal HTML only if it differs to prevent cursor jumping
  useEffect(() => {
    if (editorRef.current) {
      const currentMarkdown = htmlToMarkdown(editorRef.current.innerHTML);
      if (currentMarkdown !== value) {
        editorRef.current.innerHTML = markdownToHtml(value || "");
      }
    }
  }, [value]);

  const handleInput = () => {
    if (editorRef.current) {
      const markdown = htmlToMarkdown(editorRef.current.innerHTML);
      onChange(markdown);
    }
  };

  const emojis = ["📝", "💰", "📈", "📱", "🤝", "🎉", "💡", "❓", "✨", "⭐", "👉", "✅"];

  const handleCommand = (command: string, e: React.MouseEvent, value?: string) => {
    e.preventDefault();
    if (command === "insertText" && value) {
      document.execCommand(command, false, value);
    } else {
      document.execCommand(command, false);
    }
    if (editorRef.current) {
      editorRef.current.focus();
      handleInput();
    }
  };

  return (
    <div className="ui-rich-text">
      {label && (
        <label className="ui-input__label" htmlFor={id}>
          {label}
        </label>
      )}
      <div 
        className={`ui-rich-text__container ${isFocused ? "ui-rich-text__container--focused" : ""}`}
        style={{
          border: isFocused ? "1px solid var(--color-brand-500)" : "1px solid var(--color-gray-300)",
          borderRadius: "var(--radius-md)",
          overflow: "hidden",
          backgroundColor: "var(--color-neutral-0)",
          transition: "border-color 0.2s ease, box-shadow 0.2s ease",
          boxShadow: isFocused ? "0 0 0 3px var(--color-brand-100)" : "none"
        }}
      >
        <div 
          className="ui-rich-text__toolbar"
          style={{
            display: "flex",
            gap: "4px",
            padding: "8px",
            borderBottom: "1px solid var(--color-gray-200)",
            backgroundColor: "var(--color-gray-50)",
            flexWrap: "wrap",
            alignItems: "center"
          }}
        >
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => handleCommand("bold", e)}
            title="Bold (*text*)"
            style={{ fontWeight: "bold", padding: "4px 8px", height: "auto" }}
          >
            B
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => handleCommand("italic", e)}
            title="Italic (_text_)"
            style={{ fontStyle: "italic", padding: "4px 8px", height: "auto", fontFamily: "serif" }}
          >
            I
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => handleCommand("strikeThrough", e)}
            title="Strikethrough (~text~)"
            style={{ textDecoration: "line-through", padding: "4px 8px", height: "auto", marginRight: "8px" }}
          >
            S
          </Button>
          
          <div style={{ width: "1px", height: "16px", backgroundColor: "var(--color-gray-300)", margin: "0 4px" }} />
          
          {emojis.map(emoji => (
            <button
              key={emoji}
              type="button"
              className="emoji-inserter-bar__btn"
              onClick={(e) => handleCommand("insertText", e, emoji)}
              style={{ padding: "4px", background: "none", border: "none", cursor: "pointer", fontSize: "16px" }}
              title={`Insert ${emoji}`}
            >
              {emoji}
            </button>
          ))}
        </div>
        
        <div
          id={id}
          ref={editorRef}
          className="ui-rich-text__content"
          contentEditable
          suppressContentEditableWarning
          onInput={handleInput}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          data-placeholder={placeholder}
          style={{
            padding: "12px",
            minHeight: "120px",
            maxHeight: "300px",
            overflowY: "auto",
            outline: "none",
            fontSize: "15px",
            lineHeight: "1.6"
          }}
        />
      </div>
      
      {/* Styles for the placeholder when content is empty */}
      <style dangerouslySetInnerHTML={{__html: `
        .ui-rich-text__content:empty:before {
          content: attr(data-placeholder);
          color: var(--color-gray-400);
          pointer-events: none;
          display: block; /* For Firefox */
        }
      `}} />
    </div>
  );
}
