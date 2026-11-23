/** Every open text file gets its own Monaco model at vault://file/<node id>. */
export const MODEL_SCHEME = 'vault'
export const modelPath = (id) => `${MODEL_SCHEME}://file/${id}`
export const idFromModel = (model) => (model?.uri.scheme === MODEL_SCHEME ? model.uri.path.slice(1) : null)
