import { ClassificationEditor } from '../ClassificationEditor/ClassificationEditor'

export function InstrumentEditor(
  props: Omit<Parameters<typeof ClassificationEditor>[0], 'dimension'>,
): React.JSX.Element {
  return <ClassificationEditor {...props} dimension="instrument" />
}
