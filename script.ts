(function (): void {
  var HISTORY_KEY: string = "scientific_calc_history";
  var THEME_KEY: string = "scientific_calc_theme";

  interface SplitDisplay {
    upper: string;
    main: string;
  }

  interface UtilsModule {
    formatNumber: (v: number) => string;
    formatExpressionForDisplay: (expr: string) => string;
    splitExpressionDisplay: (expr: string, fallbackMain?: string) => SplitDisplay;
    factorial: (n: number) => number;
    toRad: (deg: number) => number;
    toDeg: (rad: number) => number;
  }

  interface Token {
    type: string;
    value?: string;
  }

  interface OperatorInfo {
    prec: number;
    assoc: string;
  }

  interface OperatorsMap {
    [key: string]: OperatorInfo;
  }

  interface EvaluatorModule {
    evaluate: (exprStr: string) => number;
    tokenize: (expr: string) => Token[];
  }

  interface HistoryEntry {
    expression: string;
    result: string;
    at: number;
  }

  interface HistoryStore {
    add: (expr: string, result: string) => void;
    list: () => HistoryEntry[];
    clear: () => void;
  }

  interface SecondMap {
    normal: string;
    sAct: string;
    sLabel: string;
    nLabel: string;
  }

  interface TrigLabelMap {
    [base: string]: { normal: string; inv: string; hyp: string; invHyp: string };
  }

  interface TrigActionMap {
    [base: string]: { normal: string; inv: string; hyp: string; invHyp: string; [key: string]: string };
  }

  var Utils: UtilsModule = (function (): UtilsModule {
    function formatNumber(v: number): string {
      if (Number.isNaN(v) || !Number.isFinite(v)) return "Error";
      if (v === 0) return "0";
      var a: number = Math.abs(v);
      if (a !== 0 && (a < 1e-15 || a > 1e15))
        return v.toExponential(10).replace(/\.?0+e/, "e");
      var str: string = parseFloat(v.toPrecision(15)).toString();
      if (str.length > 20) str = parseFloat(v.toPrecision(12)).toString();
      return str;
    }

    function formatIndianInteger(intPart: string): string {
      if (!intPart) return "";
      if (intPart.length <= 3) return intPart;
      var last3: string = intPart.slice(-3);
      var rest: string = intPart.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ",");
      return rest + "," + last3;
    }

    function formatIndianNumberString(n: string): string {
      var sign: string = "";
      var raw: string = String(n || "");
      if (!raw) return raw;
      if (raw.charAt(0) === "-") {
        sign = "-";
        raw = raw.slice(1);
      }
      var parts: string[] = raw.split(".");
      var intPart: string = parts[0] || "0";
      var fracPart: string = parts.length > 1 ? "." + parts.slice(1).join(".") : "";
      return sign + formatIndianInteger(intPart) + fracPart;
    }

    function formatExpressionForDisplay(expr: string): string {
      return String(expr || "").replace(/-?\d+(?:\.\d+)?/g, function (m: string): string {
        return formatIndianNumberString(m);
      });
    }

    function splitExpressionDisplay(expr: string, fallbackMain?: string): SplitDisplay {
      var raw: string = String(expr || "");
      var fallback: string = String(fallbackMain || "0");
      if (!raw) return { upper: "", main: fallback };

      var m: RegExpMatchArray | null = raw.match(/(-?\d*\.?\d+(?:[eE][+\-]?\d+)?)$/);
      if (m && (m.index! + m[0].length === raw.length)) {
        return { upper: raw.slice(0, m.index), main: m[0] };
      }

      if (/[+\-×÷%^(]$/.test(raw)) {
        return { upper: raw, main: "0" };
      }

      return { upper: "", main: raw };
    }

    function factorial(n: number): number {
      if (!Number.isInteger(n) || n < 0)
        throw new Error("Invalid input");
      if (n > 170) throw new Error("Overflow");
      var r: number = 1;
      for (var i: number = 2; i <= n; i++) r *= i;
      return r;
    }

    function toRad(deg: number): number { return deg * Math.PI / 180; }
    function toDeg(rad: number): number { return rad * 180 / Math.PI; }

    return {
      formatNumber: formatNumber,
      formatExpressionForDisplay: formatExpressionForDisplay,
      splitExpressionDisplay: splitExpressionDisplay,
      factorial: factorial,
      toRad: toRad,
      toDeg: toDeg
    };
  })();

  var Evaluator: EvaluatorModule = (function (): EvaluatorModule {
    var OPERATORS: OperatorsMap = {
      "+": { prec: 1, assoc: "L" },
      "-": { prec: 1, assoc: "L" },
      "*": { prec: 2, assoc: "L" },
      "/": { prec: 2, assoc: "L" },
      "%": { prec: 2, assoc: "L" },
      "^": { prec: 3, assoc: "R" },
      "u-": { prec: 4, assoc: "R" }
    };

    function tokenize(expr: string): Token[] {
      var tokens: Token[] = [];
      var i: number = 0;
      var len: number = expr.length;

      while (i < len) {
        var ch: string = expr[i];

        if (ch === " " || ch === "\t") { i++; continue; }

        if (/[0-9.]/.test(ch)) {
          var start: number = i;
          while (i < len && /[0-9.]/.test(expr[i])) i++;
          if (i < len && (expr[i] === "e" || expr[i] === "E")) {
            i++;
            if (i < len && (expr[i] === "+" || expr[i] === "-")) i++;
            while (i < len && /[0-9]/.test(expr[i])) i++;
          }
          tokens.push({ type: "number", value: expr.slice(start, i) });
          continue;
        }

        if (ch === "(") { tokens.push({ type: "lparen" }); i++; continue; }
        if (ch === ")") { tokens.push({ type: "rparen" }); i++; continue; }

        if ("+-*/%^".indexOf(ch) !== -1) {
          if (ch === "-" || ch === "+") {
            var prev: Token | null = tokens.length > 0 ? tokens[tokens.length - 1] : null;
            var isUnary: boolean = !prev || prev.type === "lparen" || prev.type === "op";
            if (isUnary && ch === "-") {
              tokens.push({ type: "op", value: "u-" });
              i++;
              continue;
            }
            if (isUnary && ch === "+") {
              i++;
              continue;
            }
          }
          tokens.push({ type: "op", value: ch });
          i++;
          continue;
        }

        throw new Error("Invalid input");
      }

      return tokens;
    }

    function toPostfix(tokens: Token[]): Token[] {
      var output: Token[] = [];
      var opStack: Token[] = [];

      for (var i: number = 0; i < tokens.length; i++) {
        var tok: Token = tokens[i];

        if (tok.type === "number") {
          output.push(tok);
          continue;
        }

        if (tok.type === "op") {
          var o1: OperatorInfo = OPERATORS[tok.value!];
          while (opStack.length > 0) {
            var top: Token = opStack[opStack.length - 1];
            if (top.type !== "op") break;
            var o2: OperatorInfo = OPERATORS[top.value!];
            if ((o1.assoc === "L" && o1.prec <= o2.prec) ||
                (o1.assoc === "R" && o1.prec < o2.prec)) {
              output.push(opStack.pop()!);
            } else break;
          }
          opStack.push(tok);
          continue;
        }

        if (tok.type === "lparen") {
          opStack.push(tok);
          continue;
        }

        if (tok.type === "rparen") {
          while (opStack.length > 0 && opStack[opStack.length - 1].type !== "lparen") {
            output.push(opStack.pop()!);
          }
          if (opStack.length === 0) throw new Error("Invalid input");
          opStack.pop();
          continue;
        }
      }

      while (opStack.length > 0) {
        var remaining: Token = opStack.pop()!;
        if (remaining.type === "lparen") throw new Error("Invalid input");
        output.push(remaining);
      }

      return output;
    }

    function evalPostfix(rpn: Token[]): number {
      var stack: number[] = [];

      for (var i: number = 0; i < rpn.length; i++) {
        var tok: Token = rpn[i];

        if (tok.type === "number") {
          var n: number = parseFloat(tok.value!);
          if (Number.isNaN(n)) throw new Error("Invalid input");
          stack.push(n);
          continue;
        }

        if (tok.value === "u-") {
          if (stack.length < 1) throw new Error("Invalid input");
          stack.push(-stack.pop()!);
          continue;
        }

        if (stack.length < 2) throw new Error("Invalid input");
        var b: number = stack.pop()!;
        var a: number = stack.pop()!;
        var r: number;

        switch (tok.value) {
          case "+": r = a + b; break;
          case "-": r = a - b; break;
          case "*": r = a * b; break;
          case "/":
            if (b === 0) throw new Error("Cannot divide by zero");
            r = a / b;
            break;
          case "%":
            if (b === 0) throw new Error("Cannot divide by zero");
            r = a % b;
            break;
          case "^":
            r = Math.pow(a, b);
            break;
          default:
            throw new Error("Invalid input");
        }

        if (Number.isNaN(r)) throw new Error("Invalid input");
        if (!Number.isFinite(r)) throw new Error("Overflow");
        stack.push(r);
      }

      if (stack.length !== 1) throw new Error("Invalid input");
      return stack[0];
    }

    function evaluate(exprStr: string): number {
      if (!exprStr || !exprStr.trim()) return 0;
      var tokens: Token[] = tokenize(exprStr.trim());
      if (tokens.length === 0) return 0;
      var rpn: Token[] = toPostfix(tokens);
      return evalPostfix(rpn);
    }

    return { evaluate: evaluate, tokenize: tokenize };
  })();

  function BasicOperations(this: any): void {}
  BasicOperations.prototype.add      = function (a: number, b: number): number { return a + b; };
  BasicOperations.prototype.subtract = function (a: number, b: number): number { return a - b; };
  BasicOperations.prototype.multiply = function (a: number, b: number): number { return a * b; };
  BasicOperations.prototype.divide   = function (a: number, b: number): number {
    if (b === 0) throw new Error("Cannot divide by zero");
    return a / b;
  };
  BasicOperations.prototype.mod = function (a: number, b: number): number {
    if (b === 0) throw new Error("Cannot divide by zero");
    return a % b;
  };

  function createHistoryStore(limit: number): HistoryStore {
    var max: number = typeof limit === "number" ? limit : 30;
    var entries: HistoryEntry[] = [];

    (function load(): void {
      try {
        var raw: string | null = localStorage.getItem(HISTORY_KEY);
        if (raw) { var p: any = JSON.parse(raw); if (Array.isArray(p)) entries = p.slice(0, max); }
      } catch (_) { entries = []; }
    })();

    function save(): void { localStorage.setItem(HISTORY_KEY, JSON.stringify(entries)); }

    return {
      add: function (expr: string, result: string): void {
        entries.unshift({ expression: expr, result: result, at: Date.now() });
        if (entries.length > max) entries.length = max;
        save();
      },
      list: function (): HistoryEntry[] { return entries.slice(); },
      clear: function (): void { entries = []; save(); }
    };
  }

  class Calculator extends (BasicOperations as any) {
    tokens: Token[];
    currentInput: string;
    result: string;
    memory: number;
    store: HistoryStore;
    isDeg: boolean;
    isFE: boolean;
    isSecond: boolean;
    isHyp: boolean;
    hasMemory: boolean;
    justEvaluated: boolean;
    errorState: boolean;
    openParenCount: number;
    lastOperator: string;
    lastOperand: string;
    _symbolicDisplay: string;

    constructor(store: HistoryStore) {
      super();

      this.tokens = [];
      this.currentInput = "";
      this.result = "0";
      this.memory = 0;
      this.store = store;
      this.isDeg = true;
      this.isFE = false;
      this.isSecond = false;
      this.isHyp = false;
      this.hasMemory = false;
      this.justEvaluated = false;
      this.errorState = false;
      this.openParenCount = 0;
      this.lastOperator = "";
      this.lastOperand = "";
      this._symbolicDisplay = "";
    }

    _lastToken(): Token | null {
      return this.tokens.length > 0 ? this.tokens[this.tokens.length - 1] : null;
    }

    _buildExpression(): string {
      var parts: string[] = [];
      for (var i: number = 0; i < this.tokens.length; i++) {
        var t: Token = this.tokens[i];
        if (t.type === "number") parts.push(t.value!);
        else if (t.type === "op") parts.push(t.value!);
        else if (t.type === "lparen") parts.push("(");
        else if (t.type === "rparen") parts.push(")");
      }
      if (this.currentInput !== "") parts.push(this.currentInput);
      return parts.join("");
    }

    _buildDisplayExpression(): string {
      var parts: string[] = [];
      for (var i: number = 0; i < this.tokens.length; i++) {
        var t: Token = this.tokens[i];
        if (t.type === "number") parts.push(t.value!);
        else if (t.type === "op") {
          if (t.value === "*") parts.push(" × ");
          else if (t.value === "/") parts.push(" ÷ ");
          else if (t.value === "+") parts.push(" + ");
          else if (t.value === "-") parts.push(" − ");
          else if (t.value === "%") parts.push(" mod ");
          else if (t.value === "^") parts.push(" ^ ");
          else parts.push(t.value!);
        }
        else if (t.type === "lparen") parts.push("(");
        else if (t.type === "rparen") parts.push(")");
      }
      if (this.currentInput !== "") parts.push(this.currentInput);
      return parts.join("");
    }

    _getCurrentValue(): number {
      if (this.currentInput !== "") {
        var v: number = parseFloat(this.currentInput);
        if (Number.isNaN(v)) throw new Error("Invalid input");
        return v;
      }
      var expr: string = this._buildExpression();
      if (!expr) {
        var fromResult: number = parseFloat(this.result);
        return Number.isFinite(fromResult) ? fromResult : 0;
      }
      return Evaluator.evaluate(expr);
    }

    appendDigit(d: string): void {
      if (this.errorState) return;
      if (this.justEvaluated) {
        this.tokens = [];
        this.currentInput = "";
        this.result = "0";
        this.justEvaluated = false;
        this.openParenCount = 0;
      }

      var last: Token | null = this._lastToken();
      if (last && (last.type === "rparen" || (last.type === "number" && this.currentInput === ""))) {
        if (last.type === "rparen") return;
      }

      if (this.currentInput === "0" && d !== "0") {
        this.currentInput = d;
        return;
      }
      if (this.currentInput === "0" && d === "0") {
        return;
      }

      var digitCount: number = this.currentInput.replace(/[^0-9]/g, "").length;
      if (digitCount >= 16) return;

      this.currentInput += d;
    }

    appendDot(): void {
      if (this.errorState) return;
      if (this.justEvaluated) {
        this.tokens = [];
        this.currentInput = "0.";
        this.result = "0";
        this.justEvaluated = false;
        this.openParenCount = 0;
        return;
      }

      if (this.currentInput === "") {
        var last: Token | null = this._lastToken();
        if (last && last.type === "rparen") return;
        this.currentInput = "0.";
        return;
      }

      if (this.currentInput.indexOf(".") !== -1) return;

      this.currentInput += ".";
    }

    appendOperator(op: string): void {
      if (this.errorState) return;

      if (this.justEvaluated) {
        var res: string = this.result;
        this.tokens = [{ type: "number", value: res }];
        this.currentInput = "";
        this.justEvaluated = false;
        this.openParenCount = 0;
      }

      if (this.currentInput === "-") {
        this.currentInput = "";
      }

      if (this.currentInput !== "") {
        this.tokens.push({ type: "number", value: this.currentInput });
        this.currentInput = "";
      }

      var last: Token | null = this._lastToken();

      if (!last) {
        this.tokens.push({ type: "number", value: this.result || "0" });
        this.tokens.push({ type: "op", value: op });
        return;
      }

      if (last.type === "op") {
        this.tokens[this.tokens.length - 1].value = op;
        return;
      }

      if (last.type === "lparen") {
        if (op === "-") {
          this.currentInput = "-";
          return;
        }
        return;
      }

      this.tokens.push({ type: "op", value: op });
    }

    appendOpenParen(): void {
      if (this.errorState) return;
      if (this.justEvaluated) {
        this.tokens = [];
        this.currentInput = "";
        this.result = "0";
        this.justEvaluated = false;
        this.openParenCount = 0;
      }

      if (this.currentInput !== "") {
        this.tokens.push({ type: "number", value: this.currentInput });
        this.currentInput = "";
        this.tokens.push({ type: "op", value: "*" });
      } else {
        var last: Token | null = this._lastToken();
        if (last && (last.type === "number" || last.type === "rparen")) {
          this.tokens.push({ type: "op", value: "*" });
        }
      }

      this.tokens.push({ type: "lparen" });
      this.openParenCount++;
    }

    appendCloseParen(): void {
      if (this.errorState) return;
      if (this.openParenCount <= 0) return;

      if (this.justEvaluated) return;

      if (this.currentInput !== "") {
        this.tokens.push({ type: "number", value: this.currentInput });
        this.currentInput = "";
      }

      var last: Token | null = this._lastToken();
      if (!last || last.type === "op" || last.type === "lparen") {
        this.tokens.push({ type: "number", value: "0" });
      }

      this.tokens.push({ type: "rparen" });
      this.openParenCount--;
    }

    clearEntry(): void {
      if (this.errorState) {
        this.clearAll();
        return;
      }
      if (this.justEvaluated) {
        this.clearAll();
        return;
      }
      if (this.currentInput !== "") {
        this.currentInput = "";
      } else {
        this.clearAll();
      }
    }

    clearAll(): void {
      this.tokens = [];
      this.currentInput = "";
      this.result = "0";
      this.justEvaluated = false;
      this.errorState = false;
      this.openParenCount = 0;
      this.lastOperator = "";
      this.lastOperand = "";
    }

    backspace(): void {
      if (this.errorState) {
        this.clearAll();
        return;
      }
      if (this.justEvaluated) {
        this.clearAll();
        return;
      }
      if (this.currentInput !== "") {
        this.currentInput = this.currentInput.slice(0, -1);
        if (this.currentInput === "" || this.currentInput === "-") {
          this.currentInput = "";
        }
        return;
      }
      if (this.tokens.length > 0) {
        var removed: Token = this.tokens.pop()!;
        if (removed.type === "lparen") this.openParenCount--;
        if (removed.type === "rparen") this.openParenCount++;
        if (removed.type === "number") {
          this.currentInput = removed.value!;
          this.currentInput = this.currentInput.slice(0, -1);
          if (this.currentInput === "" || this.currentInput === "-") {
            this.currentInput = "";
          }
        }
      }
    }

    toggleSign(): void {
      if (this.errorState) return;

      if (this.justEvaluated) {
        var num: number = parseFloat(this.result);
        if (Number.isNaN(num)) return;
        num = -num;
        this.result = Utils.formatNumber(num);
        this.tokens = [];
        this.currentInput = this.result;
        this.justEvaluated = false;
        this.openParenCount = 0;
        return;
      }

      if (this.currentInput === "" || this.currentInput === "0") {
        this.currentInput = "-";
        return;
      }

      if (this.currentInput === "-") {
        this.currentInput = "";
        return;
      }

      if (this.currentInput.charAt(0) === "-") {
        this.currentInput = this.currentInput.slice(1);
      } else {
        this.currentInput = "-" + this.currentInput;
      }
    }

    appendConstant(name: string): void {
      if (this.errorState) return;

      var val: string;
      if (name === "PI") val = Math.PI.toString();
      else if (name === "E") val = Math.E.toString();
      else return;

      if (this.justEvaluated) {
        this.tokens = [];
        this.currentInput = val;
        this.result = "0";
        this.justEvaluated = false;
        this.openParenCount = 0;
        return;
      }

      if (this.currentInput !== "") {
        this.tokens.push({ type: "number", value: this.currentInput });
        this.currentInput = "";
        this.tokens.push({ type: "op", value: "*" });
      } else {
        var last: Token | null = this._lastToken();
        if (last && (last.type === "number" || last.type === "rparen")) {
          this.tokens.push({ type: "op", value: "*" });
        }
      }
      this.tokens.push({ type: "number", value: val });
    }

    evaluate(): void {
      if (this.errorState) return;

      if (this.justEvaluated) {
        if (this.lastOperator && this.lastOperand) {
          var repeatExpr: string = this.result + this.lastOperator + this.lastOperand;
          try {
            var val: number = Evaluator.evaluate(repeatExpr);
            var fmt: string = this.isFE ? val.toExponential(4) : Utils.formatNumber(val);
            var dispOp: string = this.lastOperator;
            if (dispOp === "*") dispOp = " × ";
            else if (dispOp === "/") dispOp = " ÷ ";
            else if (dispOp === "+") dispOp = " + ";
            else if (dispOp === "-") dispOp = " − ";
            this.store.add(this.result + dispOp + this.lastOperand + " =", fmt);
            this.result = fmt;
          } catch (err) {
            this.result = "0";
            this.errorState = true;
            throw err;
          }
        }
        return;
      }

      if (this.currentInput !== "") {
        this.tokens.push({ type: "number", value: this.currentInput });
        this.currentInput = "";
      }

      while (this.openParenCount > 0) {
        var last: Token | null = this._lastToken();
        if (last && (last.type === "op" || last.type === "lparen")) {
          this.tokens.push({ type: "number", value: "0" });
        }
        this.tokens.push({ type: "rparen" });
        this.openParenCount--;
      }

      if (this.tokens.length === 0) {
        this.store.add("0", "0");
        return;
      }

      var last2: Token | null = this._lastToken();
      if (last2 && last2.type === "op") {
        this.tokens.pop();
      }

      if (this.tokens.length === 0) {
        this.store.add("0", "0");
        return;
      }

      this.lastOperator = "";
      this.lastOperand = "";
      var len: number = this.tokens.length;
      if (len >= 3) {
        var tLast: Token = this.tokens[len - 1];
        var tOp: Token = this.tokens[len - 2];
        if (tLast.type === "number" && tOp.type === "op") {
          this.lastOperator = tOp.value!;
          this.lastOperand = tLast.value!;
        }
      }

      var displayExpr: string = this._buildDisplayExpression();
      var infixExpr: string = this._buildExpression();

      try {
        var val: number = Evaluator.evaluate(infixExpr);
        var fmt: string = this.isFE ? val.toExponential(4) : Utils.formatNumber(val);
        this.result = fmt;
        this.tokens = [];
        this.currentInput = "";
        this.justEvaluated = true;
        this.openParenCount = 0;
        this.store.add(displayExpr + " =", fmt);
      } catch (err) {
        this.result = "0";
        this.errorState = true;
        throw err;
      }
    }

    _angleIn(v: number): number { return this.isDeg ? Utils.toRad(v) : v; }
    _angleOut(v: number): number { return this.isDeg ? Utils.toDeg(v) : v; }

    applyUnary(action: string): string {
      if (this.errorState) return "";
      var v: number;
      var applyTarget: "standalone" | "currentInput" | "token" = "standalone";
      var tokenIndex: number = -1;
      if (this.justEvaluated) {
        v = parseFloat(this.result);
        if (Number.isNaN(v)) throw new Error("Invalid input");
        this.justEvaluated = false;
        this.tokens = [];
        this.currentInput = "";
        this.openParenCount = 0;
      } else if (this.currentInput !== "") {
        v = parseFloat(this.currentInput);
        if (Number.isNaN(v)) throw new Error("Invalid input");
        applyTarget = "currentInput";
      } else {
        var last: Token | null = this._lastToken();
        if (last && last.type === "number") {
          v = parseFloat(last.value!);
          if (Number.isNaN(v)) throw new Error("Invalid input");
          applyTarget = "token";
          tokenIndex = this.tokens.length - 1;
        } else {
          v = this._getCurrentValue();
        }
      }

      var n: number;
      var symbolBefore: string = "";
      var symbolAfter: string = "";

      switch (action) {
        case "sqrt":
          if (v < 0) throw new Error("Invalid input");
          n = Math.sqrt(v);
          symbolBefore = "√("; symbolAfter = ")";
          break;
        case "cbrt":
          n = Math.cbrt(v);
          symbolBefore = "∛("; symbolAfter = ")";
          break;
        case "square":
          n = v * v;
          symbolBefore = "sqr("; symbolAfter = ")";
          break;
        case "cube":
          n = v * v * v;
          symbolBefore = "cube("; symbolAfter = ")";
          break;
        case "inverse":
          if (v === 0) throw new Error("Cannot divide by zero");
          n = 1 / v;
          symbolBefore = "1/("; symbolAfter = ")";
          break;
        case "abs":
          n = Math.abs(v);
          symbolBefore = "|"; symbolAfter = "|";
          break;
        case "log":
          if (v <= 0) throw new Error("Invalid input");
          n = Math.log10(v);
          symbolBefore = "log("; symbolAfter = ")";
          break;
        case "ln":
          if (v <= 0) throw new Error("Invalid input");
          n = Math.log(v);
          symbolBefore = "ln("; symbolAfter = ")";
          break;
        case "log2":
          if (v <= 0) throw new Error("Invalid input");
          n = Math.log2(v);
          symbolBefore = "log₂("; symbolAfter = ")";
          break;
        case "sin":
          n = Math.sin(this._angleIn(v));
          if (this.isDeg && (v % 180 === 0)) n = 0;
          symbolBefore = "sin("; symbolAfter = ")";
          break;
        case "cos":
          n = Math.cos(this._angleIn(v));
          if (this.isDeg && ((v - 90) % 180 === 0)) n = 0;
          symbolBefore = "cos("; symbolAfter = ")";
          break;
        case "tan":
          if (this.isDeg && ((v - 90) % 180 === 0) && ((v - 90) / 180 % 2 === 0))
            throw new Error("Undefined");
          n = Math.tan(this._angleIn(v));
          if (this.isDeg && (v % 180 === 0)) n = 0;
          symbolBefore = "tan("; symbolAfter = ")";
          break;
        case "sec":
          if (this.isDeg && ((v - 90) % 180 === 0) && ((v - 90) / 180 % 2 === 0))
            throw new Error("Undefined");
          n = 1 / Math.cos(this._angleIn(v));
          symbolBefore = "sec("; symbolAfter = ")";
          break;
        case "csc":
          if (this.isDeg && (v % 180 === 0))
            throw new Error("Undefined");
          n = 1 / Math.sin(this._angleIn(v));
          symbolBefore = "csc("; symbolAfter = ")";
          break;
        case "cot":
          if (this.isDeg && (v % 180 === 0))
            throw new Error("Undefined");
          n = 1 / Math.tan(this._angleIn(v));
          if (this.isDeg && ((v - 90) % 180 === 0)) n = 0;
          symbolBefore = "cot("; symbolAfter = ")";
          break;
        case "asin":
          if (v < -1 || v > 1) throw new Error("Invalid input");
          n = this._angleOut(Math.asin(v));
          symbolBefore = "sin⁻¹("; symbolAfter = ")";
          break;
        case "acos":
          if (v < -1 || v > 1) throw new Error("Invalid input");
          n = this._angleOut(Math.acos(v));
          symbolBefore = "cos⁻¹("; symbolAfter = ")";
          break;
        case "atan":
          n = this._angleOut(Math.atan(v));
          symbolBefore = "tan⁻¹("; symbolAfter = ")";
          break;
        case "asec":
          if (v > -1 && v < 1) throw new Error("Invalid input");
          n = this._angleOut(Math.acos(1 / v));
          symbolBefore = "sec⁻¹("; symbolAfter = ")";
          break;
        case "acsc":
          if (v > -1 && v < 1) throw new Error("Invalid input");
          n = this._angleOut(Math.asin(1 / v));
          symbolBefore = "csc⁻¹("; symbolAfter = ")";
          break;
        case "acot":
          n = this._angleOut(Math.atan(1 / v));
          symbolBefore = "cot⁻¹("; symbolAfter = ")";
          break;
        case "sinh":
          n = Math.sinh(v);
          symbolBefore = "sinh("; symbolAfter = ")";
          break;
        case "cosh":
          n = Math.cosh(v);
          symbolBefore = "cosh("; symbolAfter = ")";
          break;
        case "tanh":
          n = Math.tanh(v);
          symbolBefore = "tanh("; symbolAfter = ")";
          break;
        case "sech":
          n = 1 / Math.cosh(v);
          symbolBefore = "sech("; symbolAfter = ")";
          break;
        case "csch":
          if (v === 0) throw new Error("Undefined");
          n = 1 / Math.sinh(v);
          symbolBefore = "csch("; symbolAfter = ")";
          break;
        case "coth":
          if (v === 0) throw new Error("Undefined");
          n = Math.cosh(v) / Math.sinh(v);
          symbolBefore = "coth("; symbolAfter = ")";
          break;
        case "asinh":
          n = Math.asinh(v);
          symbolBefore = "sinh⁻¹("; symbolAfter = ")";
          break;
        case "acosh":
          if (v < 1) throw new Error("Invalid input");
          n = Math.acosh(v);
          symbolBefore = "cosh⁻¹("; symbolAfter = ")";
          break;
        case "atanh":
          if (v <= -1 || v >= 1) throw new Error("Invalid input");
          n = Math.atanh(v);
          symbolBefore = "tanh⁻¹("; symbolAfter = ")";
          break;
        case "asech":
          if (v <= 0 || v > 1) throw new Error("Invalid input");
          n = Math.acosh(1 / v);
          symbolBefore = "sech⁻¹("; symbolAfter = ")";
          break;
        case "acsch":
          if (v === 0) throw new Error("Invalid input");
          n = Math.asinh(1 / v);
          symbolBefore = "csch⁻¹("; symbolAfter = ")";
          break;
        case "acoth":
          if (v >= -1 && v <= 1) throw new Error("Invalid input");
          n = Math.atanh(1 / v);
          symbolBefore = "coth⁻¹("; symbolAfter = ")";
          break;
        case "factorial":
          n = Utils.factorial(v);
          symbolBefore = "fact("; symbolAfter = ")";
          break;
        case "exp":
          n = Math.exp(v);
          symbolBefore = "e^("; symbolAfter = ")";
          break;
        case "floor":
          n = Math.floor(v);
          symbolBefore = "⌊"; symbolAfter = "⌋";
          break;
        case "ceil":
          n = Math.ceil(v);
          symbolBefore = "⌈"; symbolAfter = "⌉";
          break;
        case "negate":
          n = -v;
          symbolBefore = "negate("; symbolAfter = ")";
          break;
        case "pow10":
          n = Math.pow(10, v);
          symbolBefore = "10^("; symbolAfter = ")";
          break;
        case "2x":
          n = Math.pow(2, v);
          symbolBefore = "2^("; symbolAfter = ")";
          break;
        default:
          throw new Error("Unknown operation");
      }

      if (!Number.isFinite(n!)) throw new Error("Overflow");

      var fmt: string = this.isFE ? n!.toExponential(4) : Utils.formatNumber(n!);

      var valStr: string = Utils.formatNumber(v);
      if (applyTarget === "currentInput") {
        this.currentInput = fmt;
      } else if (applyTarget === "token") {
        this.tokens[tokenIndex].value = fmt;
        this.currentInput = "";
      } else {
        this.tokens = [];
        this.currentInput = fmt;
      }
      this.result = fmt;
      this._symbolicDisplay = symbolBefore + valStr + symbolAfter;

      return fmt;
    }

    _memoryInputValue(): number {
      if (this.currentInput !== "") {
        var v: number = parseFloat(this.currentInput);
        if (Number.isFinite(v)) return v;
      }
      var fromResult: number = parseFloat(this.result);
      if (Number.isFinite(fromResult)) return fromResult;
      return 0;
    }

    memoryStore(): void {
      if (this.errorState) return;
      this.memory = this._memoryInputValue();
      this.hasMemory = true;
    }
    memoryRecall(): void {
      if (this.errorState) return;
      if (!this.hasMemory) return;
      var mem: string = Utils.formatNumber(this.memory);
      if (this.justEvaluated) {
        this.tokens = [];
        this.justEvaluated = false;
        this.openParenCount = 0;
      }
      this.currentInput = mem;
      this.result = mem;
    }
    memoryClear(): void {
      this.memory = 0;
      this.hasMemory = false;
    }
    memoryAdd(): void {
      if (this.errorState) return;
      this.memory = this.add(this.memory, this._memoryInputValue());
      this.hasMemory = true;
    }
    memorySubtract(): void {
      if (this.errorState) return;
      this.memory = this.subtract(this.memory, this._memoryInputValue());
      this.hasMemory = true;
    }

    getExpressionDisplay(): string {
      if (this._symbolicDisplay) return this._symbolicDisplay;
      if (this.justEvaluated) return "";
      return this._buildDisplayExpression();
    }

    getMainDisplay(): string {
      if (this.errorState) return this.result;
      if (this.justEvaluated) return this.result;
      if (this.currentInput !== "") return this.currentInput;
      var last: Token | null = this._lastToken();
      if (last && last.type === "number") return last.value!;
      return this.result || "0";
    }
  }

  class CalculatorApp {
    displayEl: HTMLElement;
    expressionEl: HTMLElement;
    historyEl: HTMLElement;
    clearHistoryBtn: HTMLElement;
    historyTabsEl: Element | null;
    historyTabBtn: Element | null;
    memoryTabBtn: Element | null;
    themeToggleBtn: HTMLElement;
    degBtn: HTMLElement;
    feBtn: HTMLElement;
    trigToggle: HTMLElement;
    funcToggle: HTMLElement;
    trigPanel: HTMLElement;
    funcPanel: HTMLElement;
    history: HistoryStore;
    calculator: Calculator;
    activeSideTab: string;
    _onKey: (e: KeyboardEvent) => void;
    _onBtn: (e: Event) => void;
    _onMemBtn: (e: Event) => void;
    _onPanelBtn: (e: Event) => void;
    _onTabClick: (e: Event) => void;
    _onHistClear: () => void;
    _onTheme: () => void;
    _onDeg: () => void;
    _onFE: () => void;

    constructor() {
      this.displayEl       = document.getElementById("display")!;
      this.expressionEl    = document.getElementById("expression")!;
      this.historyEl       = document.getElementById("historyList")!;
      this.clearHistoryBtn = document.getElementById("clearHistoryBtn")!;
      this.historyTabsEl   = document.querySelector(".history-tabs");
      this.historyTabBtn   = document.querySelector('.tab-btn[data-tab="history"]');
      this.memoryTabBtn    = document.querySelector('.tab-btn[data-tab="memory"]');
      this.themeToggleBtn  = document.getElementById("themeToggle")!;
      this.degBtn          = document.querySelector('[data-mini="deg"]')! as HTMLElement;
      this.feBtn           = document.querySelector('[data-mini="f-e"]')! as HTMLElement;
      this.trigToggle      = document.getElementById("trigToggle")!;
      this.funcToggle      = document.getElementById("funcToggle")!;
      this.trigPanel       = document.getElementById("trigPanel")!;
      this.funcPanel       = document.getElementById("funcPanel")!;

      this.history    = createHistoryStore(30);
      this.calculator = new Calculator(this.history);
      this.activeSideTab = "history";

      this._onKey       = this._onKeyHandler.bind(this);
      this._onBtn       = this._onBtnHandler.bind(this);
      this._onMemBtn    = this._onMemBtnHandler.bind(this);
      this._onPanelBtn  = this._onPanelBtnHandler.bind(this);
      this._onTabClick  = this._onTabClickHandler.bind(this);
      this._onHistClear = this._onHistClearHandler.bind(this);
      this._onTheme     = this._onThemeHandler.bind(this);
      this._onDeg       = this._onDegHandler.bind(this);
      this._onFE        = this._onFEHandler.bind(this);
    }

    init(): void {
      document.querySelector(".keys")!.addEventListener("click", this._onBtn);
      document.querySelector(".memory-row")!.addEventListener("click", this._onMemBtn);

      this.trigToggle.addEventListener("click", function (this: CalculatorApp): void {
        var open: boolean = this.trigPanel.classList.toggle("open");
        this.funcPanel.classList.remove("open");
        this.trigToggle.classList.toggle("panel-open", open);
        this.funcToggle.classList.remove("panel-open");
      }.bind(this));

      this.funcToggle.addEventListener("click", function (this: CalculatorApp): void {
        var open: boolean = this.funcPanel.classList.toggle("open");
        this.trigPanel.classList.remove("open");
        this.funcToggle.classList.toggle("panel-open", open);
        this.trigToggle.classList.remove("panel-open");
      }.bind(this));

      this.trigPanel.addEventListener("click", this._onPanelBtn);
      this.funcPanel.addEventListener("click", this._onPanelBtn);
      if (this.historyTabsEl) this.historyTabsEl.addEventListener("click", this._onTabClick);

      this.clearHistoryBtn.addEventListener("click", this._onHistClear);
      this.themeToggleBtn.addEventListener("click", this._onTheme);
      this.degBtn.addEventListener("click", this._onDeg);
      this.feBtn.addEventListener("click", this._onFE);
      window.addEventListener("keydown", this._onKey);

      this._restoreTheme();
      this._renderSidePanel();
      this._refresh();
      this._updateMemBtns();
    }

    _onTabClickHandler(e: Event): void {
      var btn: HTMLElement | null = (e.target as HTMLElement).closest(".tab-btn");
      if (!btn || !(btn as any).dataset.tab) return;
      this.activeSideTab = (btn as any).dataset.tab;
      if (this.historyTabBtn) this.historyTabBtn.classList.toggle("active", this.activeSideTab === "history");
      if (this.memoryTabBtn) this.memoryTabBtn.classList.toggle("active", this.activeSideTab === "memory");
      this._renderSidePanel();
    }

    _renderSidePanel(): void {
      if (this.activeSideTab === "memory") {
        this._renderMemory();
      } else {
        this._renderHistory();
      }
    }

    _onPanelBtnHandler(e: Event): void {
      var btn: HTMLElement | null = (e.target as HTMLElement).closest("button");
      if (!btn || !(btn as any).dataset.action) return;
      var action: string = (btn as any).dataset.action;

      try {
        if (action === "second") {
          this._toggle2nd();
        } else if (action === "hyp") {
          this._toggleHyp();
        } else if (action === "rand") {
          var r: number = Math.random();
          this.calculator.currentInput = r.toString();
          this.calculator.result = this.calculator.currentInput;
          this.calculator._symbolicDisplay = "";
          this.calculator.justEvaluated = false;
        } else if (action === "dms") {
          var val: number = this.calculator._getCurrentValue();
          var d: number = Math.trunc(val);
          var m: number = Math.trunc((val - d) * 60);
          var s: number = ((val - d) * 60 - m) * 60;
          var res: string = d + "." + String(Math.abs(m)).padStart(2, "0") + Math.abs(s).toFixed(2).replace(".", "");
          this.calculator.currentInput = res;
          this.calculator.result = res;
          this.calculator._symbolicDisplay = "";
        } else if (action === "deg2") {
          var val2: number = this.calculator._getCurrentValue();
          var d2: number = Math.trunc(val2);
          var frac: number = val2 - d2;
          var min2: number = Math.trunc(frac * 100);
          var sec2: number = (frac * 100 - min2) * 100;
          var dec: number = d2 + min2 / 60 + sec2 / 3600;
          var fmt: string = Utils.formatNumber(dec);
          this.calculator.currentInput = fmt;
          this.calculator.result = fmt;
          this.calculator._symbolicDisplay = "";
        } else {
          this.calculator.applyUnary(action);
        }
        this._refresh();
      } catch (err) {
        this._showError(err as Error);
      }
    }

    _closePanels(): void {
      this.trigPanel.classList.remove("open");
      this.funcPanel.classList.remove("open");
      this.trigToggle.classList.remove("panel-open");
      this.funcToggle.classList.remove("panel-open");
    }

    _onDegHandler(): void {
      this.calculator.isDeg = !this.calculator.isDeg;
      this.degBtn.textContent = this.calculator.isDeg ? "DEG" : "RAD";
      this.degBtn.classList.toggle("active", true);
    }

    _onFEHandler(): void {
      this.calculator.isFE = !this.calculator.isFE;
      this.feBtn.classList.toggle("active", this.calculator.isFE);
      var numStr: string = this.calculator.currentInput || this.calculator.result;
      if (numStr && numStr !== "0") {
        var num: number = parseFloat(numStr);
        if (!isNaN(num) && isFinite(num)) {
          var formatted: string = this.calculator.isFE
            ? num.toExponential(4)
            : Utils.formatNumber(num);
          this.calculator.result = formatted;
          if (this.calculator.currentInput !== "") {
            this.calculator.currentInput = formatted;
          }
        }
      }
      this._refresh();
    }

    _onMemBtnHandler(e: Event): void {
      var btn: HTMLElement | null = (e.target as HTMLElement).closest("button");
      if (!btn || !(btn as any).dataset.action) return;
      var a: string = (btn as any).dataset.action;
      try {
        switch (a) {
          case "mc":     this.calculator.memoryClear();    break;
          case "mr":     this.calculator.memoryRecall();   break;
          case "ms":     this.calculator.memoryStore();    break;
          case "mplus":  this.calculator.memoryAdd();      break;
          case "mminus": this.calculator.memorySubtract(); break;
        }
        this._updateMemBtns();
        this._renderSidePanel();
        this._refresh();
      } catch (err) { this._showError(err as Error); }
    }

    _updateMemBtns(): void {
      var has: boolean = this.calculator.hasMemory;
      var mc: Element | null = document.querySelector('[data-action="mc"]');
      var mr: Element | null = document.querySelector('[data-action="mr"]');
      if (mc) mc.classList.toggle("disabled", !has);
      if (mr) mr.classList.toggle("disabled", !has);
    }

    _onBtnHandler(e: Event): void {
      var btn: HTMLElement | null = (e.target as HTMLElement).closest("button");
      if (!btn) return;
      var val: string | undefined = (btn as any).dataset.value;
      var op: string | undefined  = (btn as any).dataset.operator;
      var act: string | undefined = (btn as any).dataset.action;

      try {
        if (val || op) {
          this.calculator._symbolicDisplay = "";
        }

        if (typeof val !== "undefined") {
          if (val === "PI" || val === "E") {
            this.calculator.appendConstant(val);
          } else if (val === ".") {
            this.calculator.appendDot();
          } else if (/^\d$/.test(val)) {
            this.calculator.appendDigit(val);
          }
        } else if (op) {
          this.calculator._symbolicDisplay = "";
          this.calculator.appendOperator(op);
        } else if (act) {
          this._dispatch(act);
        }
        this._refresh();
      } catch (err) {
        this._showError(err as Error);
      }
    }

    _dispatch(action: string): void {
      switch (action) {
        case "clear":     this.calculator.clearEntry(); break;
        case "backspace": this.calculator.backspace(); break;
        case "equals":
          this.calculator._symbolicDisplay = "";
          this.calculator.evaluate();
          this._renderSidePanel();
          break;
        case "sign":      this.calculator.toggleSign(); break;
        case "open":      this.calculator.appendOpenParen(); break;
        case "close":     this.calculator.appendCloseParen(); break;
        case "power":
          this.calculator._symbolicDisplay = "";
          this.calculator.appendOperator("^");
          break;
        case "pow10":
          this.calculator.applyUnary("pow10");
          break;
        case "second":    this._toggle2nd(); break;
        case "sqrt": case "cbrt":
        case "square": case "cube":
        case "inverse": case "abs":
        case "factorial": case "exp":
        case "log": case "ln": case "log2":
        case "sin": case "cos": case "tan":
        case "asin": case "acos": case "atan":
        case "sinh": case "cosh": case "tanh":
        case "asinh": case "acosh": case "atanh":
        case "sech": case "csch": case "coth":
        case "asech": case "acsch": case "acoth":
        case "2x":
          this.calculator.applyUnary(action);
          break;
      }
    }

    _toggle2nd(): void {
      this.calculator.isSecond = !this.calculator.isSecond;
      var s: boolean = this.calculator.isSecond;
      var map: SecondMap[] = [
        { normal: "second",  sAct: "second",  sLabel: "2<sup>nd</sup>", nLabel: "2<sup>nd</sup>" },
        { normal: "square",  sAct: "cube",    sLabel: "x³",           nLabel: "x²" },
        { normal: "sqrt",    sAct: "cbrt",    sLabel: "³√x",          nLabel: "²√x" },
        { normal: "pow10",   sAct: "2x",      sLabel: "2ˣ",           nLabel: "10ˣ" },
        { normal: "log",     sAct: "log2",    sLabel: "log₂",         nLabel: "log" },
        { normal: "ln",      sAct: "exp",     sLabel: "eˣ",           nLabel: "ln" },
      ];
      map.forEach(function (m: SecondMap): void {
        var el: HTMLElement | null = document.querySelector('.key[data-action="' + (s ? m.normal : m.sAct) + '"]');
        if (el) {
          (el as any).dataset.action = s ? m.sAct : m.normal;
          el.innerHTML = s ? m.sLabel : m.nLabel;
        }
      });

      var secondBtn: HTMLElement | null = document.querySelector('.key[data-action="second"]');
      if (secondBtn) secondBtn.classList.toggle("active-2nd", s);
      var secondPanelBtn: HTMLElement | null = document.querySelector('.panel-key[data-action="second"]');
      if (secondPanelBtn) secondPanelBtn.classList.toggle("active-2nd", s);

      this._updateTrigLabels();
    }

    _toggleHyp(): void {
      this.calculator.isHyp = !this.calculator.isHyp;
      var hypBtn: HTMLElement | null = this.trigPanel.querySelector('[data-action="hyp"]');
      if (hypBtn) hypBtn.classList.toggle("active-2nd", this.calculator.isHyp);
      this._updateTrigLabels();
    }

    _updateTrigLabels(): void {
      var s: boolean = this.calculator.isSecond;
      var h: boolean = this.calculator.isHyp;

      var labelMap: TrigLabelMap = {
        sin:  { normal: "sin",  inv: "sin⁻¹",  hyp: "sinh",  invHyp: "sinh⁻¹" },
        cos:  { normal: "cos",  inv: "cos⁻¹",  hyp: "cosh",  invHyp: "cosh⁻¹" },
        tan:  { normal: "tan",  inv: "tan⁻¹",  hyp: "tanh",  invHyp: "tanh⁻¹" },
        sec:  { normal: "sec",  inv: "sec⁻¹",  hyp: "sech",  invHyp: "sech⁻¹" },
        csc:  { normal: "csc",  inv: "csc⁻¹",  hyp: "csch",  invHyp: "csch⁻¹" },
        cot:  { normal: "cot",  inv: "cot⁻¹",  hyp: "coth",  invHyp: "coth⁻¹" }
      };

      var actionMap: TrigActionMap = {
        sin:  { normal: "sin",  inv: "asin",  hyp: "sinh",  invHyp: "asinh" },
        cos:  { normal: "cos",  inv: "acos",  hyp: "cosh",  invHyp: "acosh" },
        tan:  { normal: "tan",  inv: "atan",  hyp: "tanh",  invHyp: "atanh" },
        sec:  { normal: "sec",  inv: "asec",  hyp: "sech",  invHyp: "asech" },
        csc:  { normal: "csc",  inv: "acsc",  hyp: "csch",  invHyp: "acsch" },
        cot:  { normal: "cot",  inv: "acot",  hyp: "coth",  invHyp: "acoth" }
      };

      var allActions: string[] = ["sin","asin","sinh","asinh","cos","acos","cosh","acosh",
                        "tan","atan","tanh","atanh","sec","asec","sech","asech",
                        "csc","acsc","csch","acsch","cot","acot","coth","acoth"];

      var mode: string = s ? (h ? "invHyp" : "inv") : (h ? "hyp" : "normal");

      Object.keys(labelMap).forEach(function (base: string): void {
        var newLabel: string = labelMap[base][mode as keyof typeof labelMap[typeof base]];
        var newAction: string = actionMap[base][mode];

        for (var i: number = 0; i < allActions.length; i++) {
          var el: HTMLElement | null = document.querySelector('.panel-key[data-action="' + allActions[i] + '"]');
          if (el && actionMap[base]) {
            var vals: string[] = Object.values(actionMap[base]);
            if (vals.indexOf(allActions[i]) !== -1) {
              (el as any).dataset.action = newAction;
              el.textContent = newLabel;
              break;
            }
          }
        }
      });
    }

    _refresh(): void {
      var calc: Calculator = this.calculator;
      var exprLine: string = calc.getExpressionDisplay();
      var mainLine: string = calc.getMainDisplay();

      this.expressionEl.textContent = Utils.formatExpressionForDisplay(exprLine);
      this.displayEl.textContent = Utils.formatExpressionForDisplay(mainLine);
    }

    _showError(err: Error): void {
      var msg: string = (err && err.message) ? err.message : "Error";
      this.calculator.errorState = true;
      this.calculator.result = msg;
      this.displayEl.textContent = msg;
      this.expressionEl.textContent = "";
    }

    _renderHistory(): void {
      var items: HistoryEntry[] = this.history.list();
      if (!items.length) {
        this.historyEl.innerHTML = '<li class="history-item"><p class="history-exp">There\'s no history yet.</p></li>';
        (this.clearHistoryBtn as HTMLElement).textContent = "Clear";
        (this.clearHistoryBtn as HTMLElement).style.display = "none";
        return;
      }
      (this.clearHistoryBtn as HTMLElement).textContent = "Clear";
      (this.clearHistoryBtn as HTMLElement).style.display = "";
      this.historyEl.innerHTML = items.map(function (it: HistoryEntry): string {
        return '<li class="history-item"><p class="history-exp">' + it.expression +
               '</p><p class="history-res">= ' + it.result + '</p></li>';
      }).join("");
    }

    _renderMemory(): void {
      if (!this.calculator.hasMemory) {
        this.historyEl.innerHTML = '<li class="history-item"><p class="history-exp">There\'s nothing saved in Memory.</p></li>';
        (this.clearHistoryBtn as HTMLElement).style.display = "none";
        return;
      }
      (this.clearHistoryBtn as HTMLElement).textContent = "Clear";
      (this.clearHistoryBtn as HTMLElement).style.display = "";
      this.historyEl.innerHTML = '<li class="history-item"><p class="history-exp">M</p><p class="history-res">' + Utils.formatNumber(this.calculator.memory) + '</p></li>';
    }

    _onHistClearHandler(): void {
      if (this.activeSideTab === "memory") {
        this.calculator.memoryClear();
        this._updateMemBtns();
      } else {
        this.history.clear();
      }
      this._renderSidePanel();
    }

    _onKeyHandler(e: KeyboardEvent): void {
      var k: string = e.key;
      try {
        this.calculator._symbolicDisplay = "";

        if (/^[0-9]$/.test(k))               { this.calculator.appendDigit(k); }
        else if (k === ".")                   { this.calculator.appendDot(); }
        else if ("+-*/%^".indexOf(k) !== -1)  { this.calculator.appendOperator(k); }
        else if (k === "p" || k === "P" || k === "π") { this.calculator.appendConstant("PI"); }
        else if (k === "Enter" || k === "=")  { e.preventDefault(); this.calculator.evaluate(); this._renderSidePanel(); }
        else if (k === "Backspace")           { this.calculator.backspace(); }
        else if (k === "Escape")              { this.calculator.clearAll(); }
        else if (k === "Delete")              { this.calculator.clearEntry(); }
        else if (k === "(")                   { this.calculator.appendOpenParen(); }
        else if (k === ")")                   { this.calculator.appendCloseParen(); }
        else return;
        this._refresh();
      } catch (err) { this._showError(err as Error); }
    }

    _restoreTheme(): void {
      var saved: string = localStorage.getItem(THEME_KEY) || "light";
      document.body.classList.toggle("dark", saved === "dark");
    }

    _onThemeHandler(): void {
      var dark: boolean = document.body.classList.toggle("dark");
      localStorage.setItem(THEME_KEY, dark ? "dark" : "light");
    }
  }

  var app: CalculatorApp = new CalculatorApp();
  app.init();
})();
