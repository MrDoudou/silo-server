import ts from "typescript";

const semanticKeyPattern = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)*(?:\.[a-z][a-z0-9]*(?:_[a-z0-9]+)*)+$/;

function unwrapExpression(expression) {
  let current = expression;
  while (
    current &&
    (ts.isAsExpression(current) ||
      ts.isSatisfiesExpression(current) ||
      ts.isParenthesizedExpression(current) ||
      ts.isNonNullExpression(current) ||
      ts.isTypeAssertionExpression(current))
  ) {
    current = current.expression;
  }
  return current;
}

function sourceLocation(filePath, sourceFile, node) {
  const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  return { filePath, line: line + 1, column: character + 1 };
}

function propertyName(node) {
  if (ts.isIdentifier(node) || ts.isStringLiteral(node) || ts.isNumericLiteral(node)) {
    return node.text;
  }
  return null;
}

function staticStrings(expression) {
  const current = unwrapExpression(expression);
  if (!current) return [];
  if (ts.isStringLiteral(current) || ts.isNoSubstitutionTemplateLiteral(current)) {
    return [{ value: current.text, node: current }];
  }
  if (ts.isConditionalExpression(current)) {
    return [...staticStrings(current.whenTrue), ...staticStrings(current.whenFalse)];
  }
  if (
    ts.isBinaryExpression(current) &&
    [ts.SyntaxKind.BarBarToken, ts.SyntaxKind.QuestionQuestionToken].includes(
      current.operatorToken.kind,
    )
  ) {
    return [...staticStrings(current.left), ...staticStrings(current.right)];
  }
  return [];
}

function isFullyStatic(expression) {
  const current = unwrapExpression(expression);
  if (!current) return false;
  if (ts.isStringLiteral(current) || ts.isNoSubstitutionTemplateLiteral(current)) return true;
  if (ts.isConditionalExpression(current)) {
    return isFullyStatic(current.whenTrue) && isFullyStatic(current.whenFalse);
  }
  if (
    ts.isBinaryExpression(current) &&
    [ts.SyntaxKind.BarBarToken, ts.SyntaxKind.QuestionQuestionToken].includes(
      current.operatorToken.kind,
    )
  ) {
    return isFullyStatic(current.left) && isFullyStatic(current.right);
  }
  return false;
}

function parseSource(filePath, source) {
  const sourceFile = ts.createSourceFile(
    filePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    filePath.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const parseError = sourceFile.parseDiagnostics?.find(
    (diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error,
  );
  if (parseError) {
    throw new Error(`${filePath}: ${ts.flattenDiagnosticMessageText(parseError.messageText, " ")}`);
  }
  return sourceFile;
}

export function parseCatalog(filePath, source) {
  const sourceFile = parseSource(filePath, source);
  const declaration = sourceFile.statements
    .filter(
      (statement) =>
        ts.isVariableStatement(statement) &&
        statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword),
    )
    .flatMap((statement) => [...statement.declarationList.declarations])
    .find((candidate) => candidate.initializer);

  if (!declaration?.initializer) throw new Error(`${filePath}: expected an exported catalog`);
  const root = unwrapExpression(declaration.initializer);
  if (!ts.isObjectLiteralExpression(root)) {
    throw new Error(`${filePath}: the catalog must be an object literal`);
  }

  const entries = new Map();
  function visitObject(object, prefix) {
    for (const property of object.properties) {
      if (!ts.isPropertyAssignment(property)) {
        throw new Error(`${filePath}: catalog entries must use property assignments`);
      }
      const name = propertyName(property.name);
      if (!name) throw new Error(`${filePath}: computed catalog keys are not supported`);
      const key = prefix ? `${prefix}.${name}` : name;
      const value = unwrapExpression(property.initializer);
      if (ts.isObjectLiteralExpression(value)) {
        visitObject(value, key);
        continue;
      }
      if (!ts.isStringLiteral(value) && !ts.isNoSubstitutionTemplateLiteral(value)) {
        throw new Error(`${filePath}: translation ${key} must be a static string`);
      }
      if (entries.has(key)) throw new Error(`${filePath}: duplicate translation key ${key}`);
      entries.set(key, {
        value: value.text,
        ...sourceLocation(filePath, sourceFile, property.name),
      });
    }
  }
  visitObject(root, "");
  return entries;
}

export function parseJsonCatalog(filePath, source) {
  return parseCatalog(filePath, `export const catalog = ${source};`);
}

function collectTranslatorBindings(sourceFile) {
  const bindings = new Set();
  function visit(node) {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isObjectBindingPattern(node.name) &&
      node.initializer &&
      ts.isCallExpression(unwrapExpression(node.initializer))
    ) {
      const call = unwrapExpression(node.initializer);
      if (ts.isIdentifier(call.expression) && call.expression.text === "useTranslation") {
        for (const element of node.name.elements) {
          const imported = element.propertyName ? propertyName(element.propertyName) : null;
          const local = ts.isIdentifier(element.name) ? element.name.text : null;
          if ((imported ?? local) === "t" && local) bindings.add(local);
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return bindings;
}

function toastMethod(call) {
  if (ts.isIdentifier(call.expression) && call.expression.text === "toast") return "message";
  if (
    ts.isPropertyAccessExpression(call.expression) &&
    ts.isIdentifier(call.expression.expression) &&
    call.expression.expression.text === "toast" &&
    ["error", "info", "loading", "message", "success", "warning"].includes(
      call.expression.name.text,
    )
  ) {
    return call.expression.name.text;
  }
  return null;
}

function jsxAttribute(attributes, name) {
  return attributes.properties.find(
    (property) => ts.isJsxAttribute(property) && property.name.text === name,
  );
}

function addToastOptionReferences(call, addExpression) {
  const options = unwrapExpression(call.arguments[1]);
  if (!options || !ts.isObjectLiteralExpression(options)) return;

  for (const property of options.properties) {
    if (!ts.isPropertyAssignment(property)) continue;
    const name = propertyName(property.name);
    if (["closeButtonAriaLabel", "description"].includes(name)) {
      if (isFullyStatic(property.initializer)) addExpression(property.initializer);
      continue;
    }
    if (!["action", "cancel"].includes(name)) continue;
    const action = unwrapExpression(property.initializer);
    if (!action || !ts.isObjectLiteralExpression(action)) continue;
    const label = action.properties.find(
      (candidate) => ts.isPropertyAssignment(candidate) && propertyName(candidate.name) === "label",
    );
    if (label && isFullyStatic(label.initializer)) addExpression(label.initializer);
  }
}

export function collectTranslationUsage(filePath, source) {
  const sourceFile = parseSource(filePath, source);
  const translatorBindings = collectTranslatorBindings(sourceFile);
  const references = [];
  const dynamicCalls = [];

  function addExpression(expression) {
    if (!expression) return;
    if (!isFullyStatic(expression)) {
      dynamicCalls.push({
        expression: source.slice(expression.getStart(), expression.getEnd()),
        ...sourceLocation(filePath, sourceFile, expression),
      });
      return;
    }
    for (const { value, node } of staticStrings(expression)) {
      references.push({ key: value, ...sourceLocation(filePath, sourceFile, node) });
    }
  }

  function visit(node) {
    if (ts.isCallExpression(node)) {
      if (toastMethod(node)) {
        addExpression(node.arguments[0]);
        addToastOptionReferences(node, addExpression);
      } else if (ts.isIdentifier(node.expression) && node.expression.text === "tr") {
        addExpression(node.arguments[0]);
      } else if (
        ts.isPropertyAccessExpression(node.expression) &&
        ts.isIdentifier(node.expression.expression) &&
        node.expression.expression.text === "tr" &&
        node.expression.name.text === "error"
      ) {
        addExpression(node.arguments[0]);
      } else if (ts.isIdentifier(node.expression) && translatorBindings.has(node.expression.text)) {
        addExpression(node.arguments[0]);
      } else if (
        ts.isPropertyAccessExpression(node.expression) &&
        ts.isIdentifier(node.expression.expression) &&
        node.expression.expression.text === "i18next" &&
        node.expression.name.text === "t"
      ) {
        addExpression(node.arguments[0]);
      }
    }

    if (
      ts.isPropertyAssignment(node) &&
      ["translation_key", "translationKey"].includes(propertyName(node.name)) &&
      isFullyStatic(node.initializer)
    ) {
      addExpression(node.initializer);
    }

    if (ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) {
      const tagName = ts.isIdentifier(node.tagName) ? node.tagName.text : null;
      if (tagName === "Trans") {
        const attribute = jsxAttribute(node.attributes, "i18nKey");
        if (attribute?.initializer && ts.isStringLiteral(attribute.initializer)) {
          addExpression(attribute.initializer);
        }
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return { references, dynamicCalls };
}

export function collectSourceReferences(filePath, source) {
  return collectTranslationUsage(filePath, source).references;
}

const visibleUIAttributes = new Set([
  "alt",
  "aria-description",
  "aria-label",
  "aria-roledescription",
  "ariaLabel",
  "buttonLabel",
  "cancelLabel",
  "confirmLabel",
  "description",
  "detail",
  "empty",
  "emptyMessage",
  "emptyText",
  "errorHint",
  "errorMessage",
  "finePrint",
  "helpText",
  "hint",
  "label",
  "loadingText",
  "message",
  "pendingLabel",
  "placeholder",
  "searchPlaceholder",
  "seriesLabel",
  "statePill",
  "sub",
  "subTitle",
  "submitLabel",
  "tagline",
  "title",
]);

const visibleUIProperties = new Set([
  "description",
  "detail",
  "display_name",
  "emptyText",
  "errorHint",
  "errorMessage",
  "helpText",
  "hint",
  "label",
  "meta",
  "navigation_label",
  "placeholder",
  "stateText",
  "sublabel",
  "subtitle",
  "summary",
  "title",
]);

function containsVisibleText(value) {
  return /[\p{L}\p{N}]/u.test(value);
}

function isTranslationCall(call) {
  if (ts.isIdentifier(call.expression)) {
    return ["t", "tr"].includes(call.expression.text);
  }
  return (
    ts.isPropertyAccessExpression(call.expression) &&
    ts.isIdentifier(call.expression.expression) &&
    ["i18next", "tr"].includes(call.expression.expression.text)
  );
}

function isLocalizedToastOption(property) {
  const name = propertyName(property.name);
  let options;

  if (["closeButtonAriaLabel", "description"].includes(name)) {
    options = property.parent;
  } else if (name === "label") {
    const action = property.parent;
    const actionProperty = action.parent;
    if (
      !ts.isObjectLiteralExpression(action) ||
      !ts.isPropertyAssignment(actionProperty) ||
      !["action", "cancel"].includes(propertyName(actionProperty.name))
    ) {
      return false;
    }
    options = actionProperty.parent;
  } else {
    return false;
  }

  const call = options.parent;
  return (
    ts.isObjectLiteralExpression(options) &&
    ts.isCallExpression(call) &&
    call.arguments[1] === options &&
    Boolean(toastMethod(call))
  );
}

export function collectHardcodedUI(filePath, source) {
  const sourceFile = parseSource(filePath, source);
  const problems = [];
  const seen = new Set();

  function add(node, value) {
    const normalized = value.replace(/\s+/g, " ").trim();
    if (!containsVisibleText(normalized)) return;
    const location = sourceLocation(filePath, sourceFile, node);
    const identity = `${location.line}:${location.column}`;
    if (seen.has(identity)) return;
    seen.add(identity);
    problems.push({ ...location, value: normalized });
  }

  function addUnsafeAttribute(node, name) {
    const location = sourceLocation(filePath, sourceFile, node);
    problems.push({
      ...location,
      value: `translation in technical attribute ${name}`,
      recommendation: "remove tr() from the technical value",
    });
  }

  function inspectExpression(expression) {
    const current = unwrapExpression(expression);
    if (!current) return;
    if (ts.isCallExpression(current) && isTranslationCall(current)) return;
    if (ts.isStringLiteral(current) || ts.isNoSubstitutionTemplateLiteral(current)) {
      add(current, current.text);
      return;
    }
    if (ts.isTemplateExpression(current)) {
      add(
        current,
        [current.head.text, ...current.templateSpans.map((span) => span.literal.text)].join(" "),
      );
      return;
    }
    if (ts.isConditionalExpression(current)) {
      inspectExpression(current.whenTrue);
      inspectExpression(current.whenFalse);
      return;
    }
    if (ts.isBinaryExpression(current)) {
      if (current.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken) {
        inspectExpression(current.right);
      } else if (
        [
          ts.SyntaxKind.BarBarToken,
          ts.SyntaxKind.PlusToken,
          ts.SyntaxKind.QuestionQuestionToken,
        ].includes(current.operatorToken.kind)
      ) {
        inspectExpression(current.left);
        inspectExpression(current.right);
      }
    }
  }

  function visitNestedJSX(node) {
    if (ts.isJsxElement(node) || ts.isJsxFragment(node) || ts.isJsxSelfClosingElement(node)) {
      visit(node);
      return;
    }
    ts.forEachChild(node, visitNestedJSX);
  }

  function visit(node) {
    if (ts.isJsxText(node)) {
      add(node, node.text);
      return;
    }
    if (ts.isJsxAttribute(node) && node.initializer) {
      if (visibleUIAttributes.has(node.name.text)) {
        if (ts.isStringLiteral(node.initializer)) add(node.initializer, node.initializer.text);
        else if (ts.isJsxExpression(node.initializer))
          inspectExpression(node.initializer.expression);
      } else if (
        ts.isJsxExpression(node.initializer) &&
        ts.isCallExpression(unwrapExpression(node.initializer.expression)) &&
        isTranslationCall(unwrapExpression(node.initializer.expression))
      ) {
        addUnsafeAttribute(node.initializer.expression, node.name.text);
      }
      visitNestedJSX(node.initializer);
      return;
    }
    if (ts.isPropertyAssignment(node)) {
      const name = propertyName(node.name);
      const initializer = unwrapExpression(node.initializer);
      if (
        name &&
        visibleUIProperties.has(name) &&
        (ts.isStringLiteral(initializer) || ts.isNoSubstitutionTemplateLiteral(initializer))
      ) {
        if (isLocalizedToastOption(node)) return;
        add(initializer, initializer.text);
        return;
      }
    }
    if (ts.isJsxExpression(node)) inspectExpression(node.expression);
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      ["alert", "confirm", "prompt", "useDocumentTitle"].includes(node.expression.text)
    ) {
      inspectExpression(node.arguments[0]);
    }
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      /^set.*(?:Error|Message|Notice|Warning)$/.test(node.expression.text)
    ) {
      inspectExpression(node.arguments[0]);
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return problems;
}

function placeholders(value) {
  const names = new Set();
  for (const match of value.matchAll(/{{\s*([A-Za-z0-9_.-]+)/g)) names.add(match[1]);
  return [...names].sort();
}

export function matchesDynamicPattern(key, pattern) {
  const wildcard = pattern.indexOf("*");
  if (wildcard < 0) return key === pattern;
  if (wildcard !== pattern.length - 1 || pattern.indexOf("*", wildcard + 1) >= 0) return false;
  return key.startsWith(pattern.slice(0, -1));
}

export function analyzeTranslationKeys({
  englishCatalog,
  translatedCatalogs,
  references,
  dynamicCalls = [],
  dynamicKeys,
}) {
  const referencedKeys = new Set(references.map(({ key }) => key));
  const invalidDynamicKeys = [];
  const seenPatterns = new Set();

  for (const rule of dynamicKeys) {
    if (
      typeof rule.pattern !== "string" ||
      (rule.pattern.includes("*") &&
        (!rule.pattern.endsWith("*") || rule.pattern.slice(0, -1).includes("*")))
    ) {
      invalidDynamicKeys.push({ rule, reason: "pattern must be a key or trailing wildcard" });
      continue;
    }
    if (typeof rule.reason !== "string" || !rule.reason.trim()) {
      invalidDynamicKeys.push({ rule, reason: "every dynamic key needs a reason" });
      continue;
    }
    const identity = `${rule.source ?? ""}\0${rule.pattern}`;
    if (seenPatterns.has(identity)) {
      invalidDynamicKeys.push({ rule, reason: "duplicate exception" });
      continue;
    }
    seenPatterns.add(identity);

    const matches = [...englishCatalog.keys()].filter((key) =>
      matchesDynamicPattern(key, rule.pattern),
    );
    if (!matches.length) {
      invalidDynamicKeys.push({ rule, reason: "pattern no longer matches an English key" });
      continue;
    }
    if (rule.source && !dynamicCalls.some(({ filePath }) => filePath === rule.source)) {
      invalidDynamicKeys.push({
        rule,
        reason: "source no longer contains a dynamic translation call",
      });
      continue;
    }
    for (const key of matches) referencedKeys.add(key);
  }

  const invalidDynamicCalls = dynamicCalls.filter(
    (call) => !dynamicKeys.some((rule) => rule.source === call.filePath),
  );
  const invalidKeyNames = [...englishCatalog]
    .filter(([key]) => !semanticKeyPattern.test(key))
    .map(([key, entry]) => ({ key, ...entry }));
  for (const reference of references) {
    if (!semanticKeyPattern.test(reference.key)) invalidKeyNames.push(reference);
  }

  const missingKeys = references.filter(({ key }) => !englishCatalog.has(key));
  const unusedKeys = [...englishCatalog]
    .filter(([key]) => !referencedKeys.has(key))
    .map(([key, entry]) => ({ key, ...entry }))
    .sort((left, right) => left.key.localeCompare(right.key));
  const unknownKeys = [];
  const placeholderMismatches = [];

  for (const [language, entries] of translatedCatalogs) {
    for (const [key, entry] of entries) {
      const englishEntry = englishCatalog.get(key);
      if (!englishEntry) {
        unknownKeys.push({ language, key, ...entry });
        continue;
      }
      const expected = placeholders(englishEntry.value);
      const actual = placeholders(entry.value);
      if (expected.join("\0") !== actual.join("\0")) {
        placeholderMismatches.push({ language, key, expected, actual, ...entry });
      }
    }
  }

  return {
    englishKeyCount: englishCatalog.size,
    referenceCount: referencedKeys.size,
    invalidDynamicCalls,
    invalidDynamicKeys,
    invalidKeyNames,
    missingKeys,
    placeholderMismatches,
    unknownKeys,
    unusedKeys,
  };
}
