/**
 * Último resultado de cada tela, guardado só em memória, para a tela abrir já preenchida
 * enquanto os dados novos chegam por trás.
 *
 * Regras de isolamento:
 * - `clear()` (troca de workspace, usuário ou sessão) apaga tudo e muda a geração;
 * - um `writer` criado antes do `clear()` é ignorado, então uma resposta atrasada do
 *   workspace anterior nunca entra no novo;
 * - a camada de API não usa isto: toda busca continua indo ao servidor.
 */
export function createViewSnapshots() {
  const entries = new Map<string, unknown>();
  let generation = 0;
  let sequence = 0;
  const written = new Map<string, number>();
  return {
    read<T>(key: string): T | undefined {
      return entries.get(key) as T | undefined;
    },
    /** Chame ANTES de buscar; use o retorno para guardar o resultado. */
    writer<T>(key: string) {
      const startedAt = generation;
      const order = ++sequence;
      return (value: T) => {
        if (startedAt !== generation || order < (written.get(key) ?? 0)) return;
        written.set(key, order);
        entries.set(key, value);
      };
    },
    drop(key: string) {
      entries.delete(key);
    },
    clear() {
      generation += 1;
      entries.clear();
    },
  };
}
