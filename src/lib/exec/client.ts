import { invoke } from '@tauri-apps/api/core';
import {
  EXEC_PLUGIN_PREFIX,
  ExecApprovalChoice,
  ExecApprovalDecision,
  ExecCommandRequest,
  ExecRequestResponse,
  ExecSessionRecord,
} from '@/types/exec';
import { useExecApprovalStore } from '@/store/useExecApprovalStore';
import { useExecStore } from '@/store/useExecStore';

async function requestExec(request: ExecCommandRequest): Promise<ExecRequestResponse> {
  return invoke<ExecRequestResponse>(`${EXEC_PLUGIN_PREFIX}request_exec`, { request });
}

async function approveExec(request: ExecCommandRequest, decision: ExecApprovalDecision): Promise<ExecRequestResponse> {
  return invoke<ExecRequestResponse>(`${EXEC_PLUGIN_PREFIX}approve_exec`, {
    request: {
      request,
      decision,
    },
  });
}

function isApprovalRejected(choice: ExecApprovalChoice): choice is Extract<ExecApprovalChoice, { decision: 'reject' }> {
  return typeof choice !== 'string' && choice.decision === 'reject';
}

function buildApprovalRejectionMessage(note?: string): string {
  const normalizedNote = note?.trim();
  if (!normalizedNote) {
    return 'Command execution was denied by the user.';
  }
  return `Command execution was denied by the user. User guidance: ${normalizedNote}`;
}

export async function runExecCommand(request: ExecCommandRequest): Promise<ExecSessionRecord> {
  const execStore = useExecStore.getState();
  await execStore.initListeners();

  let response = await requestExec(request);
  if (response.status === 'blocked') {
    throw new Error(response.message ?? 'Command was blocked by exec runtime.');
  }

  if (response.status === 'approval_required') {
    if (!request.toolCallId || !response.approval) {
      throw new Error('Approval flow is missing toolCallId or approval payload.');
    }
    execStore.markPendingApproval(request.toolCallId, {
      command: request.command,
      workdir: response.approval.workdir,
      reason: response.approval.reason,
    });

    const decision = await useExecApprovalStore.getState().ask({
      toolCallId: request.toolCallId,
      request,
      approval: response.approval,
    });
    execStore.clearPendingApproval(request.toolCallId);

    if (isApprovalRejected(decision)) {
      throw new Error(buildApprovalRejectionMessage(decision.note));
    }

    response = await approveExec(request, decision);
    if (response.status === 'blocked') {
      throw new Error(response.message ?? 'Command was blocked by exec runtime.');
    }
    if (response.status !== 'started') {
      throw new Error('Command did not start after approval.');
    }
  }

  if (response.status !== 'started' || !response.session) {
    throw new Error('Command execution failed to start.');
  }

  useExecStore.getState().registerSession(response.session);
  return useExecStore.getState().awaitCompletion(response.session.id);
}
