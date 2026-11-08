import type { WorkerTransport } from './worker-transport.ts'
import type { DbCommand, DbReply } from '../protocol/messages.ts'
import { isDbCommand } from '../protocol/messages.ts'
import { DomainValidationError } from '../../../shared/domain/validation.ts'

type CommandAction = DbCommand['action']

// Replies group action literals that share a result shape, so a single action
// has to be matched against each member's action union instead of `Extract`.
type ResultOf<Reply, Action> = Reply extends {
  action: infer ReplyAction
  result: infer Result
}
  ? Action extends ReplyAction
    ? Result
    : never
  : never

type ResultFor<Action extends CommandAction> = ResultOf<DbReply, Action>

export type ClientRequest = <Command extends DbCommand>(
  command: Command,
) => Promise<ResultFor<Command['action']>>

export interface ClientCore {
  request: ClientRequest
  close(): Promise<void>
}

export function createClientCore(transport: WorkerTransport): ClientCore {
  return {
    // Every command goes through this one path: validate the shape, send it, and
    // unwrap the result the transport already narrowed to this action.
    async request<Command extends DbCommand>(
      command: Command,
    ): Promise<ResultFor<Command['action']>> {
      transport.assertOpen()
      if (!isDbCommand(command)) {
        throw new DomainValidationError('Invalid database request.')
      }
      const reply: DbReply = await transport.request(command)
      // The transport rejects any reply whose action differs from the command it
      // answered, so the reply here is the one the worker sent for this action.
      return (reply as unknown as { result: ResultFor<Command['action']> })
        .result
    },
    close(): Promise<void> {
      return transport.close()
    },
  }
}
