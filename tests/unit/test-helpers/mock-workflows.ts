import { vi } from 'vitest'

/**
 * Create a mock Workflow instance
 */
export function createMockWorkflow() {
  return {
    create: vi.fn(),
    get: vi.fn()
  }
}

/**
 * Create mock WorkflowStep
 */
export function createMockWorkflowStep() {
  return {
    do: vi.fn(),
    sleep: vi.fn()
  }
}

/**
 * Create mock WorkflowEvent
 * @param payload - The payload for the event
 */
export function createMockWorkflowEvent(payload: any) {
  return {
    payload,
    timestamp: new Date()
  }
}