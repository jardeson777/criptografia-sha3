class SHA3 {
  private readonly digestBitLength = 256; // Para SHA3-256 (pode ser 224, 256, 384 ou 512)
  private readonly r = 1600 - 2 * this.digestBitLength; //tamanho em bits do bloco de entrada (1152, 1088, 832 ou 576)

  private readonly roundConstants: bigint[] = [
    0x0000000000000001n,
    0x0000000000008082n,
    0x800000000000808an,
    0x8000000080008000n,
    0x000000000000808bn,
    0x0000000080000001n,
    0x8000000080008081n,
    0x8000000000008009n,
    0x000000000000008an,
    0x0000000000000088n,
    0x0000000080008009n,
    0x000000008000000an,
    0x000000008000808bn,
    0x800000000000008bn,
    0x8000000000008089n,
    0x8000000000008003n,
    0x8000000000008002n,
    0x8000000000000080n,
    0x000000000000800an,
    0x800000008000000an,
    0x8000000080008081n,
    0x8000000000008080n,
    0x0000000080000001n,
    0x8000000080008008n,
  ];

  public initializeState(): bigint[][] {
    const state: bigint[][] = [[], [], [], [], []];
    for (let x = 0; x < 5; x++) {
      for (let y = 0; y < 5; y++) {
        state[x][y] = 0n;
      }
    }
    return state;
  }

  public getMessageUtf8(message: string) {
    return this.utf8Encode(message);
  }

  public utf8Encode(str: string) {
    try {
      return new TextEncoder()
        .encode(str)
        .reduce((prev, curr) => prev + String.fromCharCode(curr), "");
    } catch (e) {
      return unescape(encodeURIComponent(str));
    }
  }

  public getPadding(message: string): string {
    const q = this.r / 8 - (message.length % (this.r / 8)); // quantos bytes de preenchimento são necessários

    if (q == 1) {
      message += String.fromCharCode(0x86);
    } else {
      message += String.fromCharCode(0x06);
      message += String.fromCharCode(0x00).repeat(q - 2);
      message += String.fromCharCode(0x80);
    }

    return message;
  }

  public getAbsorb(message: string, state: bigint[][]): bigint[][] {
    const blocksize = (this.r / 64) * 8; // tamanho do bloco em bytes
    let stateCurrent = state;

    for (let i = 0; i < message.length; i += blocksize) {
      for (let j = 0; j < this.r / 64; j++) {
        const i64 =
          (BigInt(message.charCodeAt(i + j * 8 + 0)) << 0n) +
          (BigInt(message.charCodeAt(i + j * 8 + 1)) << 8n) +
          (BigInt(message.charCodeAt(i + j * 8 + 2)) << 16n) +
          (BigInt(message.charCodeAt(i + j * 8 + 3)) << 24n) +
          (BigInt(message.charCodeAt(i + j * 8 + 4)) << 32n) +
          (BigInt(message.charCodeAt(i + j * 8 + 5)) << 40n) +
          (BigInt(message.charCodeAt(i + j * 8 + 6)) << 48n) +
          (BigInt(message.charCodeAt(i + j * 8 + 7)) << 56n);
        const x = j % 5;
        const y = Math.floor(j / 5);
        stateCurrent[x][y] = stateCurrent[x][y] ^ i64;
      }
      stateCurrent = this.permutation(stateCurrent);
    }

    return stateCurrent;
  }

  public permutation(state: bigint[][]): bigint[][] {
    function ROT(a: bigint, d: number) {
      // 64-bit rotaciona para esquerda
      return BigInt.asUintN(64, (a << BigInt(d)) | (a >> BigInt(64 - d)));
    }

    let stateCurrent = state;

    const nRounds = 24;

    for (let r = 0; r < nRounds; r++) {
      // θ = Theta
      let C: bigint[] = [],
        D: bigint[] = []; // intermediate sub-states
      for (let x = 0; x < 5; x++) {
        C[x] = stateCurrent[x][0];
        for (let y = 1; y < 5; y++) {
          C[x] = C[x] ^ stateCurrent[x][y];
        }
      }
      for (let x = 0; x < 5; x++) {
        // D[x] = C[x−1] ⊕ ROT(C[x+1], 1)
        D[x] = C[(x + 4) % 5] ^ ROT(C[(x + 1) % 5], 1);
        // a[x,y] = a[x,y] ⊕ D[x]
        for (let y = 0; y < 5; y++) {
          stateCurrent[x][y] = stateCurrent[x][y] ^ D[x];
        }
      }

      // ρ + π = Rho + Pi
      let [x, y] = [1, 0];
      let current = stateCurrent[x][y];
      for (let t = 0; t < 24; t++) {
        const [X, Y] = [y, (2 * x + 3 * y) % 5];
        const tmp = stateCurrent[X][Y];
        stateCurrent[X][Y] = ROT(current, (((t + 1) * (t + 2)) / 2) % 64);
        current = tmp;
        [x, y] = [X, Y];
      }

      // χ = Chi
      for (let y = 0; y < 5; y++) {
        const C: bigint[] = []; // take a copy of the plane
        for (let x = 0; x < 5; x++) C[x] = stateCurrent[x][y];
        for (let x = 0; x < 5; x++) {
          stateCurrent[x][y] = C[x] ^ (~C[(x + 1) % 5] & C[(x + 2) % 5]);
        }
      }

      // ι = Iota
      stateCurrent[0][0] = stateCurrent[0][0] ^ this.roundConstants[r];
    }

    return stateCurrent;
  }

  public getSqueezing(state: bigint[][]): string {
    function transpose(array: bigint[][]) {
      // para iterar em y (colunas) antes de x (linhas)
      return array.map((row, r: number) => array.map((col) => col[r]));
    }

    let output = transpose(state)
      .map((plane) =>
        plane
          .map((lane) => {
            const hexString = lane.toString(16).padStart(16, "0");
            const hexArray = hexString.match(/.{2}/g);

            return hexArray ? hexArray.reverse().join("") : "";
          })
          .join("")
      )
      .join("")
      .slice(0, this.digestBitLength / 4);

    return output;
  }

  public hash(message: string): string {
    const messageUtf8 = this.getMessageUtf8(message);
    const state = this.initializeState();
    const padding = this.getPadding(messageUtf8);
    const absorbing = this.getAbsorb(padding, state);
    const squeezing = this.getSqueezing(absorbing);

    return squeezing;
  }
}

const sha3 = new SHA3();
console.log(sha3.hash("a"));
//site para consultar a resposta: https://www.browserling.com/tools/sha3-hash
