// Runs in the Figma plugin sandbox: document access only, no network.
figma.showUI(__html__, { width: 420, height: 360, title: 'Kiter Token Bridge' })

async function describeDocument() {
  if (!figma.variables) {
    figma.ui.postMessage({
      type: 'document',
      supported: false,
      collections: [],
      total: 0,
    })
    return
  }
  const collections = await figma.variables.getLocalVariableCollectionsAsync()
  const described = collections.map((collection) => ({
    name: collection.name,
    count: collection.variableIds.length,
  }))
  const total = described.reduce((sum, entry) => sum + entry.count, 0)
  figma.ui.postMessage({
    type: 'document',
    supported: true,
    collections: described,
    total,
  })
}

figma.ui.onmessage = async (message) => {
  if (!message) {
    return
  }
  if (message.type === 'describe') {
    await describeDocument()
    return
  }
  if (message.type === 'close') {
    figma.closePlugin()
  }
}

describeDocument()
