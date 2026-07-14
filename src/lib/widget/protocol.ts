export const WIDGET_STATE_MESSAGE_TYPE = "workflowai:widget-state";

export interface WidgetStateMessage {
  type: typeof WIDGET_STATE_MESSAGE_TYPE;
  isOpen: boolean;
}
