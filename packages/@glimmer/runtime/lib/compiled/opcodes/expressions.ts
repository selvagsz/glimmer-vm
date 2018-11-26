import { Opaque, Option } from '@glimmer/interfaces';
import { VersionedPathReference } from '@glimmer/reference';
import { Op, Register } from '@glimmer/vm';
import { ScopeBlock } from '../../scope';
import { APPEND_OPCODES, OpcodeKind } from '../../opcodes';
import { FALSE_REFERENCE, TRUE_REFERENCE } from '../../references';
import { PublicVM } from '../../vm';
import { ConcatReference } from '../expressions/concat';
import { assert } from '@glimmer/util';
import {
  check,
  CheckFunction,
  CheckOption,
  CheckHandle,
  CheckBlockSymbolTable,
  CheckOr,
} from '@glimmer/debug';
import { stackAssert } from './assert';
import {
  CheckArguments,
  CheckPathReference,
  CheckCompilableBlock,
  CheckScope,
} from './-debug-strip';
import { CONSTANTS } from '../../symbols';

export type FunctionExpression<T> = (vm: PublicVM) => VersionedPathReference<T>;

APPEND_OPCODES.add(
  Op.Helper,
  (vm, { op1: handle }) => {
    let stack = vm.stack;
    let helper = check(vm[CONSTANTS].resolveHandle(handle), CheckFunction);
    let args = check(stack.pop(), CheckArguments);
    let value = helper(vm, args);

    vm.loadValue(Register.v0, value);
  },
  OpcodeKind.Mut
);

APPEND_OPCODES.add(
  Op.GetVariable,
  (vm, { op1: symbol }) => {
    let expr = vm.referenceForSymbol(symbol);
    vm.stack.push(expr);
  },
  OpcodeKind.Mut
);

APPEND_OPCODES.add(
  Op.SetVariable,
  (vm, { op1: symbol }) => {
    let expr = check(vm.stack.pop(), CheckPathReference);
    vm.scopeMut.bindSymbol(symbol, expr);
  },
  OpcodeKind.Mut
);

APPEND_OPCODES.add(
  Op.SetBlock,
  (vm, { op1: symbol }) => {
    let handle = check(vm.stack.pop(), CheckOr(CheckOption(CheckHandle), CheckCompilableBlock));
    let scope = check(vm.stack.pop(), CheckScope);
    let table = check(vm.stack.pop(), CheckOption(CheckBlockSymbolTable));

    let block: Option<ScopeBlock> = table ? [handle!, scope!, table] : null;

    vm.scopeMut.bindBlock(symbol, block);
  },
  OpcodeKind.Mut
);

APPEND_OPCODES.add(
  Op.ResolveMaybeLocal,
  (vm, { op1: _name }) => {
    let name = vm[CONSTANTS].getString(_name);
    let locals = vm.scope.getPartialMap()!;

    let ref = locals[name];
    if (ref === undefined) {
      ref = vm.scope.getSelf().get(name);
    }

    vm.stack.push(ref);
  },
  OpcodeKind.Mut
);

APPEND_OPCODES.add(
  Op.RootScope,
  (vm, { op1: symbols }) => {
    vm.pushRootScope(symbols);
  },
  OpcodeKind.Mut
);

APPEND_OPCODES.add(
  Op.GetProperty,
  (vm, { op1: _key }) => {
    let key = vm[CONSTANTS].getString(_key);
    let expr = check(vm.stack.pop(), CheckPathReference);
    vm.stack.push(expr.get(key));
  },
  OpcodeKind.Mut
);

APPEND_OPCODES.add(
  Op.GetBlock,
  (vm, { op1: _block }) => {
    let { stack } = vm;
    let block = vm.scope.getBlock(_block);

    if (block) {
      stack.push(block[2]);
      stack.push(block[1]);
      stack.push(block[0]);
    } else {
      stack.push(null);
      stack.push(null);
      stack.push(null);
    }
  },
  OpcodeKind.Mut
);

APPEND_OPCODES.add(
  Op.HasBlock,
  (vm, { op1: _block }) => {
    let hasBlock = !!vm.scope.getBlock(_block);
    vm.stack.push(hasBlock ? TRUE_REFERENCE : FALSE_REFERENCE);
  },
  OpcodeKind.Mut
);

APPEND_OPCODES.add(
  Op.HasBlockParams,
  vm => {
    // FIXME(mmun): should only need to push the symbol table
    let block = vm.stack.pop();
    let scope = vm.stack.pop();
    check(block, CheckOption(CheckOr(CheckHandle, CheckCompilableBlock)));
    check(scope, CheckOption(CheckScope));
    let table = check(vm.stack.pop(), CheckOption(CheckBlockSymbolTable));

    assert(
      table === null || (table && typeof table === 'object' && Array.isArray(table.parameters)),
      stackAssert('Option<BlockSymbolTable>', table)
    );

    let hasBlockParams = table && table.parameters.length;
    vm.stack.push(hasBlockParams ? TRUE_REFERENCE : FALSE_REFERENCE);
  },
  OpcodeKind.Mut
);

APPEND_OPCODES.add(
  Op.Concat,
  (vm, { op1: count }) => {
    let out: Array<VersionedPathReference<Opaque>> = new Array(count);

    for (let i = count; i > 0; i--) {
      let offset = i - 1;
      out[offset] = check(vm.stack.pop(), CheckPathReference);
    }

    vm.stack.push(new ConcatReference(out));
  },
  OpcodeKind.Mut
);
