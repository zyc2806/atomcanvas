"""
Unit tests for geometry_cache.py (T4-6).
Pure unit tests — no FastAPI, no file I/O.
"""

import threading
import numpy as np
import pytest
from ase import Atoms
from ase.build import molecule

from app.services.geometry_cache import (
    LRUCache,
    GEOMETRY_CACHE_MAXSIZE,
    fingerprint_atoms,
    bonds_cache_key,
    hbonds_cache_key,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _h2(pos=None):
    """Build a simple H2 molecule (optionally shift positions)."""
    positions = pos if pos is not None else [[0.0, 0.0, 0.0], [0.74, 0.0, 0.0]]
    return Atoms("H2", positions=positions)


def _water():
    return molecule("H2O")


# ---------------------------------------------------------------------------
# 1. fingerprint stability
# ---------------------------------------------------------------------------

class TestFingerprintStability:
    def test_same_atoms_same_fingerprint(self):
        a1 = _h2()
        a2 = _h2()
        assert fingerprint_atoms(a1) == fingerprint_atoms(a2)

    def test_different_positions_different_fingerprint(self):
        a1 = _h2([[0.0, 0.0, 0.0], [0.74, 0.0, 0.0]])
        a2 = _h2([[0.0, 0.0, 0.0], [1.00, 0.0, 0.0]])
        assert fingerprint_atoms(a1) != fingerprint_atoms(a2)

    def test_different_numbers_different_fingerprint(self):
        a1 = Atoms("H2", positions=[[0, 0, 0], [1, 0, 0]])
        a2 = Atoms("HHe", positions=[[0, 0, 0], [1, 0, 0]])
        assert fingerprint_atoms(a1) != fingerprint_atoms(a2)

    def test_different_cell_different_fingerprint(self):
        a1 = Atoms("H", positions=[[0, 0, 0]], cell=[5, 5, 5])
        a2 = Atoms("H", positions=[[0, 0, 0]], cell=[6, 5, 5])
        assert fingerprint_atoms(a1) != fingerprint_atoms(a2)

    def test_different_pbc_different_fingerprint(self):
        a1 = Atoms("H", positions=[[0, 0, 0]], cell=[5, 5, 5], pbc=False)
        a2 = Atoms("H", positions=[[0, 0, 0]], cell=[5, 5, 5], pbc=True)
        assert fingerprint_atoms(a1) != fingerprint_atoms(a2)

    def test_returns_bytes(self):
        assert isinstance(fingerprint_atoms(_h2()), bytes)

    def test_fingerprint_length(self):
        # blake2b digest_size=16 → 16 bytes
        assert len(fingerprint_atoms(_h2())) == 16


# ---------------------------------------------------------------------------
# 2. miss → hit (compute-once semantics)
# ---------------------------------------------------------------------------

class TestMissHit:
    def test_first_call_computes(self):
        cache = LRUCache()
        counter = [0]

        def compute():
            counter[0] += 1
            return "result"

        result = cache.get_or_compute("key1", compute)
        assert result == "result"
        assert counter[0] == 1

    def test_second_call_cached(self):
        cache = LRUCache()
        counter = [0]
        sentinel = object()

        def compute():
            counter[0] += 1
            return sentinel

        cache.get_or_compute("key1", compute)
        result2 = cache.get_or_compute("key1", compute)
        assert counter[0] == 1
        assert result2 is sentinel  # same object identity

    def test_different_keys_both_compute(self):
        cache = LRUCache()
        counter = [0]

        def make_compute(val):
            def _():
                counter[0] += 1
                return val
            return _

        cache.get_or_compute("a", make_compute(1))
        cache.get_or_compute("b", make_compute(2))
        assert counter[0] == 2


# ---------------------------------------------------------------------------
# 3. key sensitivity
# ---------------------------------------------------------------------------

class TestKeySensitivity:
    """bonds_cache_key changes on relevant param mutations, not on dict reordering."""

    def setup_method(self):
        self.atoms = _h2()

    def test_different_bond_scale_different_key(self):
        k1 = bonds_cache_key(self.atoms, 1.2, {}, "auto")
        k2 = bonds_cache_key(self.atoms, 1.3, {}, "auto")
        assert k1 != k2

    def test_different_override_different_key(self):
        k1 = bonds_cache_key(self.atoms, 1.2, {"0-1": "single"}, "auto")
        k2 = bonds_cache_key(self.atoms, 1.2, {"0-1": "double"}, "auto")
        assert k1 != k2

    def test_added_override_different_key(self):
        k1 = bonds_cache_key(self.atoms, 1.2, {}, "auto")
        k2 = bonds_cache_key(self.atoms, 1.2, {"0-1": "single"}, "auto")
        assert k1 != k2

    def test_different_inference_mode_different_key(self):
        k1 = bonds_cache_key(self.atoms, 1.2, {}, "auto")
        k2 = bonds_cache_key(self.atoms, 1.2, {}, "quick")
        assert k1 != k2

    def test_reordering_overrides_same_key(self):
        """Dict insertion order must NOT affect the key (sorted-items normalization)."""
        ov1 = {"0-1": "single", "1-2": "double"}
        ov2 = {"1-2": "double", "0-1": "single"}
        k1 = bonds_cache_key(self.atoms, 1.2, ov1, "auto")
        k2 = bonds_cache_key(self.atoms, 1.2, ov2, "auto")
        assert k1 == k2

    def test_none_overrides_same_as_empty_dict(self):
        k1 = bonds_cache_key(self.atoms, 1.2, None, "auto")
        k2 = bonds_cache_key(self.atoms, 1.2, {}, "auto")
        assert k1 == k2

    def test_hbonds_key_distance_sensitivity(self):
        k1 = hbonds_cache_key(self.atoms, 3.5, 120)
        k2 = hbonds_cache_key(self.atoms, 4.0, 120)
        assert k1 != k2

    def test_hbonds_key_angle_sensitivity(self):
        k1 = hbonds_cache_key(self.atoms, 3.5, 120)
        k2 = hbonds_cache_key(self.atoms, 3.5, 150)
        assert k1 != k2


# ---------------------------------------------------------------------------
# 4. eviction (LRU)
# ---------------------------------------------------------------------------

class TestEviction:
    def test_len_bounded_by_maxsize(self):
        cache = LRUCache(maxsize=GEOMETRY_CACHE_MAXSIZE)
        for i in range(GEOMETRY_CACHE_MAXSIZE + 1):
            cache.get_or_compute(i, lambda i=i: i)
        assert len(cache) == GEOMETRY_CACHE_MAXSIZE

    def test_oldest_key_evicted(self):
        """After filling the cache and inserting one more, key 0 (oldest) must recompute."""
        cache = LRUCache(maxsize=GEOMETRY_CACHE_MAXSIZE)
        first_key = 0
        # fill the cache: keys 0..MAXSIZE-1
        for i in range(GEOMETRY_CACHE_MAXSIZE):
            cache.get_or_compute(i, lambda i=i: i * 10)

        # insert one more → evicts key 0
        cache.get_or_compute(GEOMETRY_CACHE_MAXSIZE, lambda: 9999)

        counter = [0]

        def recompute():
            counter[0] += 1
            return -1

        cache.get_or_compute(first_key, recompute)
        assert counter[0] == 1, "oldest key should have been evicted and must recompute"

    def test_recently_used_key_not_evicted(self):
        """Accessing a key bumps it to the end so it survives the next eviction."""
        cache = LRUCache(maxsize=GEOMETRY_CACHE_MAXSIZE)
        for i in range(GEOMETRY_CACHE_MAXSIZE):
            cache.get_or_compute(i, lambda i=i: i)

        # refresh key 0 → it's now MRU
        counter_0 = [0]
        cache.get_or_compute(0, lambda: counter_0.__setitem__(0, counter_0[0] + 1) or 0)
        assert counter_0[0] == 0  # should still be cached

        # now insert one new key → evicts key 1 (new oldest), not key 0
        cache.get_or_compute(GEOMETRY_CACHE_MAXSIZE, lambda: 9999)

        # key 0 must still be cached
        sentinel = object()
        result = cache.get_or_compute(0, lambda: sentinel)
        assert result is not sentinel, "key 0 should still be in cache (was refreshed)"


# ---------------------------------------------------------------------------
# 5. mutation-then-reuse
# ---------------------------------------------------------------------------

class TestMutationThenReuse:
    def test_position_mutation_causes_miss(self):
        atoms = _h2([[0.0, 0.0, 0.0], [0.74, 0.0, 0.0]])
        cache = LRUCache()
        counter = [0]

        def compute():
            counter[0] += 1
            return "original"

        k_original = bonds_cache_key(atoms, 1.2, {}, "auto")
        cache.get_or_compute(k_original, compute)
        assert counter[0] == 1

        # mutate position
        atoms.positions[1] = [1.5, 0.0, 0.0]
        k_mutated = bonds_cache_key(atoms, 1.2, {}, "auto")

        assert k_original != k_mutated, "mutated atoms must have different key"

        cache.get_or_compute(k_mutated, compute)
        assert counter[0] == 2  # forced recompute

    def test_mutate_back_reuses_original_cache(self):
        atoms = _h2([[0.0, 0.0, 0.0], [0.74, 0.0, 0.0]])
        cache = LRUCache()
        counter = [0]

        def compute():
            counter[0] += 1
            return "value"

        k_original = bonds_cache_key(atoms, 1.2, {}, "auto")
        cache.get_or_compute(k_original, compute)

        # mutate then restore
        atoms.positions[1] = [1.5, 0.0, 0.0]
        atoms.positions[1] = [0.74, 0.0, 0.0]

        k_restored = bonds_cache_key(atoms, 1.2, {}, "auto")
        assert k_original == k_restored, "restored atoms must have same key as original"

        cache.get_or_compute(k_restored, compute)
        assert counter[0] == 1  # cache hit on restored key


# ---------------------------------------------------------------------------
# 6. thread-safety smoke test
# ---------------------------------------------------------------------------

class TestThreadSafety:
    def test_concurrent_access_no_exception(self):
        cache = LRUCache(maxsize=GEOMETRY_CACHE_MAXSIZE)
        errors = []

        def worker(thread_id):
            try:
                for i in range(20):
                    key = (thread_id + i) % (GEOMETRY_CACHE_MAXSIZE + 4)
                    cache.get_or_compute(key, lambda k=key: k * 2)
            except Exception as exc:
                errors.append(exc)

        threads = [threading.Thread(target=worker, args=(t,)) for t in range(8)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()

        assert not errors, f"Thread errors: {errors}"
        assert len(cache) <= GEOMETRY_CACHE_MAXSIZE
