package com.kairnlabs.cainos;

import java.io.IOException;
import java.io.Reader;

/**
 * A small streaming JSON reader. Provider catalogues can be tens of megabytes, so they are
 * read token by token instead of being loaded into memory. Pure Java: runs on Android and on
 * a desktop JVM (which is how it is unit-tested).
 */
public final class JsonIn {
    private final Reader in;
    private int pushed = -2;

    public JsonIn(Reader in) { this.in = in; }

    private int read() throws IOException {
        if (pushed != -2) { int c = pushed; pushed = -2; return c; }
        return in.read();
    }

    private int peekRaw() throws IOException {
        if (pushed == -2) pushed = in.read();
        return pushed;
    }

    /** Skips whitespace, commas and colons; returns the next significant char without consuming it (-1 at end). */
    public int peek() throws IOException {
        for (;;) {
            int c = peekRaw();
            if (c == ' ' || c == '\n' || c == '\r' || c == '\t' || c == ',' || c == ':' || c == 0xFEFF) { pushed = -2; continue; }
            return c;
        }
    }

    private void expect(char want) throws IOException {
        int c = peek();
        if (c != want) throw new IOException("Expected '" + want + "' but found " + (c < 0 ? "end of data" : "'" + (char) c + "'"));
        pushed = -2;
    }

    public void beginObject() throws IOException { expect('{'); }
    public void endObject() throws IOException { expect('}'); }
    public void beginArray() throws IOException { expect('['); }
    public void endArray() throws IOException { expect(']'); }

    /** True while the current object or array has another member. */
    public boolean hasNext() throws IOException {
        int c = peek();
        if (c < 0) throw new IOException("Unexpected end of data");
        return c != '}' && c != ']';
    }

    public String nextName() throws IOException {
        if (peek() != '"') throw new IOException("Expected a name");
        return readString();
    }

    /** Reads any scalar as text. null literal returns null. Objects and arrays are skipped and return null. */
    public String nextString() throws IOException {
        int c = peek();
        if (c == '"') return readString();
        if (c == '{' || c == '[') { skipValue(); return null; }
        StringBuilder sb = new StringBuilder();
        for (;;) {
            int d = peekRaw();
            if (d < 0 || d == ',' || d == '}' || d == ']' || d == ' ' || d == '\n' || d == '\r' || d == '\t') break;
            sb.append((char) d);
            pushed = -2;
            if (sb.length() > 64) throw new IOException("Bad literal");
        }
        String s = sb.toString();
        if (s.isEmpty()) throw new IOException("Unexpected character");
        return "null".equals(s) ? null : s;
    }

    private String readString() throws IOException {
        pushed = -2; // opening quote
        StringBuilder sb = new StringBuilder();
        for (;;) {
            int c = in.read();
            if (c < 0) throw new IOException("Unterminated string");
            if (c == '"') return sb.toString();
            if (c == '\\') {
                int e = in.read();
                switch (e) {
                    case 'n': sb.append('\n'); break;
                    case 't': sb.append('\t'); break;
                    case 'r': sb.append('\r'); break;
                    case 'b': sb.append('\b'); break;
                    case 'f': sb.append('\f'); break;
                    case 'u': {
                        int v = 0;
                        for (int i = 0; i < 4; i++) {
                            int h = in.read();
                            int d = Character.digit(h, 16);
                            if (d < 0) throw new IOException("Bad unicode escape");
                            v = (v << 4) | d;
                        }
                        sb.append((char) v);
                        break;
                    }
                    case -1: throw new IOException("Unterminated string");
                    default: sb.append((char) e);
                }
            } else sb.append((char) c);
        }
    }

    public void skipValue() throws IOException {
        int c = peek();
        if (c == '"') { readString(); return; }
        if (c == '{') {
            beginObject();
            while (hasNext()) { nextName(); skipValue(); }
            endObject();
            return;
        }
        if (c == '[') {
            beginArray();
            while (hasNext()) skipValue();
            endArray();
            return;
        }
        nextString();
    }

    /** Escapes text for embedding in a JSON string literal (without the quotes). */
    public static String esc(String s) {
        if (s == null) return "";
        StringBuilder sb = new StringBuilder(s.length() + 8);
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            switch (c) {
                case '"': sb.append("\\\""); break;
                case '\\': sb.append("\\\\"); break;
                case '\n': sb.append("\\n"); break;
                case '\r': sb.append("\\r"); break;
                case '\t': sb.append("\\t"); break;
                case ' ': sb.append("\\u2028"); break;
                case ' ': sb.append("\\u2029"); break;
                default:
                    if (c < 0x20) sb.append(String.format("\\u%04x", (int) c));
                    else sb.append(c);
            }
        }
        return sb.toString();
    }

    public static String q(String s) { return "\"" + esc(s) + "\""; }
}
