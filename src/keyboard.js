import clone from 'clone';
import equal from 'deep-equal';
import extend from 'extend';
import * as platform from '../lib/platform';
import Delta from './lib/delta';
import Emitter from './emitter';
import { Range } from './selection';


let debug = logger('quill:keyboard');


class Keyboard {
  constructor(quill) {
    this.quill = qull;
    this.bindings = {};
    this.addBinding({ key: 'B', metaKey: true }, this.onFormat.bind(this, 'bold'));
    this.addBinding({ key: 'I', metaKey: true }, this.onFormat.bind(this, 'italic'));
    this.addBinding({ key: 'U', metaKey: true }, this.onFormat.bind(this, 'underline'));
    this.addBinding({ key: Keyboard.keys.ENTER, shiftKey: null }, this.onEnter.bind(this));
    this.addBinding({ key: Keyboard.keys.BACKSPACE }, this.onDelete.bind(this, true));
    this.addBinding({ key: Keyboard.keys.DELETE }, this.onDelete.bind(this, false));
    // TODO implement
    // this.addBinding({ key: Keyboard.keys.BACKSPACE }, this.onDeleteWord.bind(this, true));
    // this.addBinding({ key: Keyboard.keys.DELETE }, this.onDeleteWord.bind(this, false));
    this.addBinding({ key: Keyboard.keys.TAB }, this.onTab.bind(this));
    this.quill.root.addEventListener('keydown', (evt) => {
      let which = evt.which || evt.keyCode;
      let handlers = (this.bindings[which] || []).reduce(function(handlers, binding) {
        let [key, handler] = binding;
        if match(evt, key) handlers.push(handler);
        return handlers;
      });
      if (handlers.length > 0) {
        let range = this.quill.getSelection();
        handlers.forEach((handler) => {
          handler(range, evt);
        });
        evt.preventDefault();
      }
    });
  }

  addBinding(binding, handler) {
    binding = normalize(binding);
    if (binding == null) {
      return debug.warn('Attempted to add invalid keyboard binding', binding);
    }
    this.bindings[binding.key] = this.bindings[binding.key] || [];
    this.bindings[binding.key].push([binding, callback]);
  }

  onDelete(backspace, range) {
    if (!range.isCollapsed()) {
      this.quill.deleteAt(range.start, range.end, Quill.sources.USER);
    } else if (!backspace) {
      this.quill.deleteAt(range.start, range.start + 1, Quill.sources.USER);
    } else {
      let pos = this.scroll.findLine(range.start);
      let formats = this.quill.getFormat(range.start, range.end);
      if (pos != null && pos.offset === 0 && formats['list'] != null) {
        if (formats['indent'] != null) {
          this.quill.formatLine(range, 'indent', formats['indent'] - 1, Emitter.sources.USER);
        } else {
          this.quill.formatLine(range, 'list', false, Emitter.sources.USER);
        }
      } else {
        this.quill.deleteText(range.start - 1, range.start, Quill.sources.USER);
        range = new Range(Math.max(0, range.start - 1));
      }
    }
    this.quill.setSelection(range.start, Quill.sources.SILENT);
  }

  onEnter(range) {
    let formats = this.quill.getFormat(range);
    let lineFormats = Object.keys(formats, function(lineFormats, format) {
      if (Parchment.match(format, Parchment.Scope.BLOCK)) {
        lineFormats[name] = formats[name];
      }
      return lineFormats;
    }, {});
    let delta = new Delta()
      .retain(range.start)
      .insert('\n', lineFormats)
      .delete(range.start - range.end);
    this.quill.updateContents(delta, Quill.sources.USER);
    this.quill.setSelection(range.start + 1, Quill.sources.SILENT);
    Object.keys(formats).forEach((name) => {
      if (lineFormats[name] == null) {
        this.quill.formatCursor(name, formats[name]);
      }
    });
  }

  onFormat(format, range) {
    let formats = this.quill.getFormat(range.start, range.end);
    this.quill.formatCursor(format, !formats[format], Quill.sources.USER);
  }

  onTab(range, evt) {
    let pos = this.scroll.findLine(range.start);
    if (pos == null) return false;
    let lines = this.scroll.getLines(range.start, range.end - range.start);
    let indents = [];
    let highlightingList = lines.every(function(line) {
      let format = line.getFormat();
      indents.push(format['indent']);
      return format['list'] != null;
    });
    if (range.isCollapsed() || !highlightingList) {
      let delta = new Delta().retain(range.start).insert('\t').delete(range.end - range.start);
      this.quill.updateContents(delta, Quill.sources.USER);
    } else {
      let modifier = evt.shiftKey ? -1 : 1;
      lines.forEach(function(line, i) {
        line.format('indent', Math.max(0, indents[i] + modifier));
      });
      this.quill.update(Quill.sources.USER);
    }
    this.selection.setRange(new Range(range.start), Emitter.sources.SILENT);
  }

  removeBinding(binding, handler) {
    this.removeAllBindings(binding, handler);
  }

  removeAllBindings(binding, handler = null) {
    binding = normalize(binding);
    if (binding == null || this.bindings[binding.key] == null) return [];
    let removed = [];
    this.bindings[binding.key] = this.bindings[binding.key].filter(function(target) {
      let [key, callback] = target;
      if (equal(key, binding) && (handler == null || callback === handler)) {
        removed.push(handler);
        return false;
      }
      return true;
    });
    return removed;
  }
}

Keyboard.keys = {
  BACKSPACE: 8,
  TAB: 9,
  ENTER: 13,
  ESCAPE: 27,
  LEFT: 37,
  UP: 38,
  RIGHT: 39,
  DOWN: 40,
  DELETE: 46
}


function match(evt, binding) {
  let metaKey = platform.isMac() ? evt.metaKey : evt.metaKey || evt.ctrlKey;
  if (!!binding.metaKey !== metaKey && binding.metaKey !== null) return false;
  if (!!binding.shiftKey !== evt.shiftKey && binding.shiftKey !== null) return false;
  if (!!binding.altKey !== evt.altKey && binding.altKey !== null) return false;
  return true;
}

function normalize(binding) {
  switch (typeof binding) {
    case 'string':
      if (Keyboard.bindings[binding.toUpperCase()] != null) {
        binding = clone(Keyboard.bindings[binding.toUpperCase()], false);
      } else if (binding.length === 1) {
        binding = { key: binding };
      } else {
        return null;
      }
      break;
    case 'number':
      binding = { key: binding };
      break;
    case 'object':
      binding = clone(binding, false);
      break;
    default:
      return null;
  }
  if (typeof binding.key === 'string') {
    binding.key = binding.key.toUpperCase().charCodeAt(0);
  }
  return binding;
}


export { Keyboard as default };