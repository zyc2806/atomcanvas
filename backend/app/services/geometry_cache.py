"""
geometry_cache.py — LRU cache for expensive geometry recomputes (T4-6).

The backend is stateless: it rebuilds Atoms from request JSON on every call.
We cache by CONTENT FINGERPRINT so any structural edit naturally misses the cache.

Read-only contract: callers MUST NOT mutate the returned objects; they are
shared references. All downstream consumers only iterate / serialise the results.
"""

import hashlib
import threading
from collections import OrderedDict
from typing import Any, Callable, Dict, Hashable, Optional

import numpy as np
from ase import Atoms

# Maximum number of distinct (atoms_fingerprint + params) entries to keep.
GEOMETRY_CACHE_MAXSIZE = 64


# ---------------------------------------------------------------------------
# Fingerprinting
# ---------------------------------------------------------------------------

def fingerprint_atoms(atoms: Atoms) -> bytes:
    """Return a 16-byte BLAKE2b digest that uniquely identifies the Atoms content.

    Covers positions, atomic numbers, cell matrix and PBC flags.
    Any of these changing will change the fingerprint → cache miss.
    """
    h = hashlib.blake2b(digest_size=16)
    h.update(np.ascontiguousarray(atoms.positions, dtype=np.float64).tobytes())
    h.update(np.ascontiguousarray(atoms.numbers, dtype=np.int64).tobytes())
    h.update(np.ascontiguousarray(atoms.cell.array, dtype=np.float64).tobytes())
    h.update(np.ascontiguousarray(atoms.pbc, dtype=bool).tobytes())
    return h.digest()


def bonds_cache_key(
    atoms: Atoms,
    bond_scale: float,
    bond_overrides: Optional[Dict[str, str]],
    bond_inference_mode: str,
) -> tuple:
    """Stable, hashable key for get_bonds_and_ghosts results."""
    fp = fingerprint_atoms(atoms)
    # Sort items so dict insertion order doesn't affect the key.
    ov = tuple(sorted((bond_overrides or {}).items()))
    return (fp, float(bond_scale), ov, str(bond_inference_mode))


def hbonds_cache_key(
    atoms: Atoms,
    distance_cutoff: float,
    angle_cutoff: float,
) -> tuple:
    """Stable, hashable key for calc_h_bond_geometries results."""
    return (fingerprint_atoms(atoms), float(distance_cutoff), float(angle_cutoff))


# ---------------------------------------------------------------------------
# LRU cache
# ---------------------------------------------------------------------------

class LRUCache:
    """Thread-safe LRU cache backed by an OrderedDict.

    Compute is performed OUTSIDE the lock so concurrent misses on different
    keys don't serialize each other.  Concurrent misses on the SAME key may
    compute twice (the second result overwrites the first), but both are
    semantically equivalent so correctness is preserved.
    """

    def __init__(self, maxsize: int = GEOMETRY_CACHE_MAXSIZE):
        self._d: "OrderedDict[Hashable, Any]" = OrderedDict()
        self._lock = threading.Lock()
        self._maxsize = maxsize

    def get_or_compute(self, key: Hashable, compute: Callable[[], Any]) -> Any:
        with self._lock:
            if key in self._d:
                self._d.move_to_end(key)
                return self._d[key]

        # Cache miss — compute outside lock to avoid serialising slow work.
        value = compute()

        with self._lock:
            self._d[key] = value
            self._d.move_to_end(key)
            while len(self._d) > self._maxsize:
                self._d.popitem(last=False)  # evict LRU (oldest)

        return value

    def __len__(self) -> int:
        with self._lock:
            return len(self._d)

    def clear(self) -> None:
        with self._lock:
            self._d.clear()


# ---------------------------------------------------------------------------
# Module-level cache instances (shared across all requests in a process)
# ---------------------------------------------------------------------------

BONDS_CACHE: LRUCache = LRUCache()
HBONDS_CACHE: LRUCache = LRUCache()
