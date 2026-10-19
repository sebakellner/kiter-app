import { ClassificationEditor } from '../ClassificationEditor/ClassificationEditor'

export function CategoryEditor(
  props: Omit<Parameters<typeof ClassificationEditor>[0], 'dimension'>,
): React.JSX.Element {
  return <ClassificationEditor {...props} dimension="category" />
}
