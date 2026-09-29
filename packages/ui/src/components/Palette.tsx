import { NODE_TYPE_LABELS, PALETTE_GROUPS } from "@drassos/designer-model";

export function Palette() {
  return (
    <section className="palette">
      <h2>Palette</h2>
      {PALETTE_GROUPS.map((group) => (
        <div key={group.id}>
          <h3>{group.label}</h3>
          <ul>
            {group.types.map((type) => (
              <li key={type}>
                <button
                  type="button"
                  draggable
                  onDragStart={(event) => {
                    event.dataTransfer.setData("application/drassos-node", type);
                    event.dataTransfer.effectAllowed = "move";
                  }}
                >
                  {NODE_TYPE_LABELS[type] ?? type}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}
