function sourceLocation(filePath, source, offset) {
  const prefix = source.slice(0, offset);
  const lines = prefix.split("\n");
  return {
    filePath,
    line: lines.length,
    column: lines.at(-1).length + 1,
  };
}

function skipQuotedString(source, start, quote) {
  let index = start + 1;
  while (index < source.length) {
    if (quote === "`" && source[index] === "`") return index + 1;
    if (quote === '"' && source[index] === "\\") {
      index += 2;
      continue;
    }
    if (source[index] === quote) return index + 1;
    index += 1;
  }
  return source.length;
}

function skipTrivia(source, start) {
  let index = start;
  while (index < source.length) {
    if (/\s/.test(source[index])) {
      index += 1;
      continue;
    }
    if (source.startsWith("//", index)) {
      index = source.indexOf("\n", index + 2);
      if (index < 0) return source.length;
      continue;
    }
    if (source.startsWith("/*", index)) {
      index = source.indexOf("*/", index + 2);
      if (index < 0) return source.length;
      index += 2;
      continue;
    }
    break;
  }
  return index;
}

function callArguments(source, openParenthesis) {
  const argumentsList = [];
  let argumentStart = openParenthesis + 1;
  let index = argumentStart;
  let depth = 0;

  while (index < source.length) {
    const current = source[index];
    if (current === '"' || current === "`") {
      index = skipQuotedString(source, index, current);
      continue;
    }
    if (source.startsWith("//", index) || source.startsWith("/*", index)) {
      index = skipTrivia(source, index);
      continue;
    }
    if (current === "(" || current === "[" || current === "{") {
      depth += 1;
      index += 1;
      continue;
    }
    if (current === ")") {
      if (depth === 0) {
        argumentsList.push({ source: source.slice(argumentStart, index), offset: argumentStart });
        return argumentsList;
      }
      depth -= 1;
      index += 1;
      continue;
    }
    if (current === "]" || current === "}") {
      depth -= 1;
      index += 1;
      continue;
    }
    if (current === "," && depth === 0) {
      argumentsList.push({ source: source.slice(argumentStart, index), offset: argumentStart });
      argumentStart = index + 1;
    }
    index += 1;
  }
  return [];
}

function decodeGoString(literal) {
  const trimmed = literal.trim();
  if (trimmed.startsWith("`") && trimmed.endsWith("`")) return trimmed.slice(1, -1);
  if (!trimmed.startsWith('"') || !trimmed.endsWith('"')) return null;

  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

function staticGoString(expression) {
  const trimmed = expression.trim();
  const value = decodeGoString(trimmed);
  if (value !== null) return value;

  const parts = trimmed.split(/\s*\+\s*/);
  if (parts.length < 2) return null;
  const decoded = parts.map(decodeGoString);
  return decoded.every((part) => part !== null) ? decoded.join("") : null;
}

const messageCalls = new Map([
  ["http.Error", 1],
  ["writeError", 3],
  ["writeErrorWithParams", 3],
  ["writeForbidden", 1],
  ["writeInternalError", 1],
  ["writePluginError", 3],
  ["writeUnauthorized", 1],
]);

function callReferences(filePath, source) {
  const references = [];
  const callPattern =
    /\b(?:http\.Error|writeErrorWithParams|writePluginError|writeError|writeForbidden|writeInternalError|writeUnauthorized)\b/g;

  for (const match of source.matchAll(callPattern)) {
    const argumentIndex = messageCalls.get(match[0]);
    const openParenthesis = skipTrivia(source, match.index + match[0].length);
    if (source[openParenthesis] !== "(") continue;

    const argument = callArguments(source, openParenthesis)[argumentIndex];
    if (!argument) continue;
    const value = staticGoString(argument.source);
    if (!value?.trim()) continue;

    references.push({
      value: value.trim(),
      ...sourceLocation(filePath, source, argument.offset),
    });
  }

  return references;
}

function namedFieldReferences(filePath, source) {
  const references = [];
  const fieldPattern = /\bMessage\s*:\s*("(?:\\.|[^"\\])*"|`[^`]*`)/g;
  const mapPattern = /"message"\s*:\s*("(?:\\.|[^"\\])*"|`[^`]*`)/g;

  for (const pattern of [fieldPattern, mapPattern]) {
    for (const match of source.matchAll(pattern)) {
      const literal = match[1];
      const value = decodeGoString(literal);
      if (!value?.trim()) continue;
      references.push({
        value: value.trim(),
        ...sourceLocation(filePath, source, match.index + match[0].indexOf(literal)),
      });
    }
  }

  return references;
}

export function collectGoSourceMessages(filePath, source) {
  return [...callReferences(filePath, source), ...namedFieldReferences(filePath, source)];
}
