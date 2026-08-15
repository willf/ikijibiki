"""Estimate a lexicon's size from repeated random samples.

Replace the demonstration ``sample_words`` function at the bottom with your
own ``sample(k) -> Iterable[str]`` implementation.

The exact likelihood assumes either:

* ``within_sample_replacement=True``: every returned word is an independent,
  uniform draw from the lexicon; or
* ``within_sample_replacement=False``: each call returns a uniform simple
  random sample (no duplicate within a call), independently of other calls.

No third-party packages are required.
"""

from __future__ import annotations

from collections import Counter
from dataclasses import dataclass
import math
import random
from typing import Callable, Iterable, Optional, Sequence


SampleFunction = Callable[[int], Iterable[str]]


@dataclass(frozen=True)
class Estimate:
    samples: int
    sample_size: int
    observations: int
    unique_words: int
    repeated_observations: int
    singleton_words: int
    doubleton_words: int
    mle: Optional[int]
    likelihood_interval: tuple[Optional[int], Optional[int]]
    bootstrap_interval: tuple[Optional[int], Optional[int]]
    chao_lower_bound: float
    confidence: float
    within_sample_replacement: bool

    @property
    def likelihood_relative_half_width(self) -> Optional[float]:
        lo, hi = self.likelihood_interval
        if self.mle is None or lo is None or hi is None:
            return None
        return (hi - lo) / (2.0 * self.mle)

    def summary(self) -> str:
        def number(value: Optional[int]) -> str:
            return "unbounded" if value is None else f"{value:,}"

        lo, hi = self.likelihood_interval
        blo, bhi = self.bootstrap_interval
        lines = [
            f"Samples: {self.samples:,} × {self.sample_size:,}",
            f"Observations: {self.observations:,}",
            f"Distinct words: {self.unique_words:,}",
            f"Repeated observations: {self.repeated_observations:,}",
            f"Singletons / doubletons: {self.singleton_words:,} / "
            f"{self.doubleton_words:,}",
            f"Uniform-sampling MLE: {number(self.mle)}",
            f"{self.confidence:.0%} likelihood interval: "
            f"[{number(lo)}, {number(hi)}]",
        ]
        if blo is not None:
            lines.append(
                f"{self.confidence:.0%} parametric-bootstrap interval: "
                f"[{number(blo)}, {number(bhi)}]"
            )
        lines.append(f"Bias-corrected Chao lower bound: {self.chao_lower_bound:,.1f}")
        return "\n".join(lines)


def collect_samples(sample: SampleFunction, i: int, k: int) -> list[list[str]]:
    """Call ``sample(k)`` i times and validate its output."""
    if i < 1:
        raise ValueError("i must be at least 1")
    if not 1 <= k <= 1000:
        raise ValueError("k must be between 1 and 1000")

    result: list[list[str]] = []
    for sample_number in range(1, i + 1):
        batch = list(sample(k))
        if len(batch) != k:
            raise ValueError(
                f"sample {sample_number} returned {len(batch)} words; expected {k}"
            )
        if any(not isinstance(word, str) or not word for word in batch):
            raise ValueError(
                f"sample {sample_number} contains a non-string or empty word"
            )
        result.append(batch)
    return result


def _log_likelihood(
    population: int,
    unique: int,
    observations: int,
    samples: int,
    sample_size: int,
    with_replacement: bool,
) -> float:
    if population < unique or population < sample_size:
        return -math.inf
    if with_replacement:
        # Constants independent of population have been omitted.
        return (
            math.lgamma(population + 1)
            - math.lgamma(population - unique + 1)
            - observations * math.log(population)
        )
    # i independent uniform k-subsets. The number of subset sequences whose
    # union is the observed U-set is constant with respect to population.
    return (
        math.lgamma(population + 1)
        - math.lgamma(population - unique + 1)
        - samples
        * (math.lgamma(population + 1) - math.lgamma(population - sample_size + 1))
    )


def _integer_mle(loglike: Callable[[int], float], lower: int) -> int:
    """Maximize a unimodal log likelihood over integers >= lower."""
    high = max(lower + 2, lower * 2)
    while loglike(high * 2) > loglike(high):
        high *= 2
        if high > 10**18:
            raise ArithmeticError("failed to bracket the likelihood maximum")
    # The maximum may lie between the last increasing grid point and the first
    # decreasing one, so include that first decreasing point in the bracket.
    high *= 2

    lo = lower
    while high - lo > 12:
        third = (high - lo) // 3
        m1, m2 = lo + third, high - third
        if loglike(m1) < loglike(m2):
            lo = m1 + 1
        else:
            high = m2 - 1
    return max(range(lo, high + 1), key=loglike)


def _lr_interval(
    loglike: Callable[[int], float], mle: int, lower: int, cutoff: float
) -> tuple[int, int]:
    threshold = loglike(mle) - cutoff / 2.0

    left_lo, left_hi = lower, mle
    while left_lo < left_hi:
        mid = (left_lo + left_hi) // 2
        if loglike(mid) >= threshold:
            left_hi = mid
        else:
            left_lo = mid + 1

    right_lo, right_hi = mle, max(mle + 1, mle * 2)
    while loglike(right_hi) >= threshold:
        right_hi *= 2
        if right_hi > 10**18:
            raise ArithmeticError("upper confidence limit exceeds 10^18")
    while right_lo + 1 < right_hi:
        mid = (right_lo + right_hi) // 2
        if loglike(mid) >= threshold:
            right_lo = mid
        else:
            right_hi = mid
    return left_lo, right_lo


def _normal_cutoff(confidence: float) -> float:
    # Likelihood-ratio cutoff is z^2. This compact inverse-normal approximation
    # is accurate enough for confidence levels used here.
    if not 0.5 < confidence < 1.0:
        raise ValueError("confidence must be between 0.5 and 1")
    p = (1.0 + confidence) / 2.0
    # Peter J. Acklam's inverse-normal approximation.
    a = (
        -39.69683028665376,
        220.9460984245205,
        -275.9285104469687,
        138.3577518672690,
        -30.66479806614716,
        2.506628277459239,
    )
    b = (
        -54.47609879822406,
        161.5858368580409,
        -155.6989798598866,
        66.80131188771972,
        -13.28068155288572,
    )
    q = p - 0.5
    r = q * q
    z = (
        (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5])
        * q
        / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1)
    )
    return z * z


def _percentile(sorted_values: Sequence[int], probability: float) -> int:
    position = probability * (len(sorted_values) - 1)
    lo = int(math.floor(position))
    hi = int(math.ceil(position))
    if lo == hi:
        return sorted_values[lo]
    weight = position - lo
    return round(sorted_values[lo] * (1 - weight) + sorted_values[hi] * weight)


def _simulate_unique(
    population: int,
    samples: int,
    sample_size: int,
    with_replacement: bool,
    rng: random.Random,
) -> int:
    observed: set[int] = set()
    for _ in range(samples):
        if with_replacement:
            observed.update(rng.randrange(population) for _ in range(sample_size))
        else:
            observed.update(rng.sample(range(population), sample_size))
    return len(observed)


def analyze_samples(
    batches: Sequence[Sequence[str]],
    *,
    within_sample_replacement: bool = False,
    confidence: float = 0.95,
    bootstrap_reps: int = 2000,
    seed: Optional[int] = None,
) -> Estimate:
    """Estimate population size from already collected, normalized samples."""
    if not batches or not batches[0]:
        raise ValueError("at least one nonempty sample is required")
    k = len(batches[0])
    if any(len(batch) != k for batch in batches):
        raise ValueError("all samples must have the same size")
    if not within_sample_replacement and any(len(set(batch)) != k for batch in batches):
        raise ValueError(
            "a sample contains duplicates; set within_sample_replacement=True"
        )

    i = len(batches)
    n = i * k
    counts = Counter(word for batch in batches for word in batch)
    unique = len(counts)
    f1 = sum(count == 1 for count in counts.values())
    f2 = sum(count == 2 for count in counts.values())

    # With subset sampling, Chao2 uses the number of samples in which each word
    # occurs. With replacement, use ordinary abundance counts (Chao1).
    if within_sample_replacement:
        chao_f1, chao_f2, correction = f1, f2, 1.0
    else:
        incidences = Counter(word for batch in batches for word in set(batch))
        chao_f1 = sum(count == 1 for count in incidences.values())
        chao_f2 = sum(count == 2 for count in incidences.values())
        correction = (i - 1) / i if i > 1 else 1.0
    chao = unique + correction * chao_f1 * (chao_f1 - 1) / (2 * (chao_f2 + 1))

    no_repeats = unique == n
    if no_repeats:
        return Estimate(
            i,
            k,
            n,
            unique,
            n - unique,
            f1,
            f2,
            None,
            (None, None),
            (None, None),
            chao,
            confidence,
            within_sample_replacement,
        )

    def ll(population: int, observed_unique: int = unique) -> float:
        return _log_likelihood(
            population, observed_unique, n, i, k, within_sample_replacement
        )

    mle = _integer_mle(ll, max(unique, k))
    lr = _lr_interval(ll, mle, max(unique, k), _normal_cutoff(confidence))

    bootstrap: tuple[Optional[int], Optional[int]] = (None, None)
    if bootstrap_reps:
        if bootstrap_reps < 100:
            raise ValueError("bootstrap_reps should be 0 or at least 100")
        rng = random.Random(seed)
        estimates: list[int] = []
        for _ in range(bootstrap_reps):
            simulated_unique = _simulate_unique(
                mle, i, k, within_sample_replacement, rng
            )
            if simulated_unique < n:
                simulated_ll = lambda population, u=simulated_unique: _log_likelihood(
                    population, u, n, i, k, within_sample_replacement
                )
                estimates.append(_integer_mle(simulated_ll, max(simulated_unique, k)))
        if estimates:
            estimates.sort()
            alpha = 1.0 - confidence
            bootstrap = (
                _percentile(estimates, alpha / 2),
                _percentile(estimates, 1 - alpha / 2),
            )

    return Estimate(
        i,
        k,
        n,
        unique,
        n - unique,
        f1,
        f2,
        mle,
        lr,
        bootstrap,
        chao,
        confidence,
        within_sample_replacement,
    )


def estimate_lexicon(
    sample: SampleFunction,
    i: int,
    k: int = 1000,
    **analysis_options: object,
) -> Estimate:
    """Collect i samples of size k and analyze them."""
    return analyze_samples(collect_samples(sample, i, k), **analysis_options)


def estimate_sequentially(
    sample: SampleFunction,
    *,
    k: int = 1000,
    initial_samples: int = 10,
    batch_samples: int = 5,
    target_relative_half_width: float = 0.20,
    max_samples: int = 100,
    **analysis_options: object,
) -> tuple[Estimate, list[list[str]]]:
    """Keep sampling until the likelihood interval reaches target precision."""
    if not 0 < target_relative_half_width < 1:
        raise ValueError("target_relative_half_width must be between 0 and 1")
    batches: list[list[str]] = []
    while len(batches) < max_samples:
        add = initial_samples if not batches else batch_samples
        add = min(add, max_samples - len(batches))
        batches.extend(collect_samples(sample, add, k))
        estimate = analyze_samples(batches, **analysis_options)
        width = estimate.likelihood_relative_half_width
        print("\n" + estimate.summary())
        if width is not None and width <= target_relative_half_width:
            return estimate, batches
    return estimate, batches


def make_sampler(items):
    position = 0

    def sample(k):
        nonlocal position

        if k <= 0:
            raise ValueError("k must be positive")

        end = position + k
        if end > len(items):
            raise IndexError("sample would go beyond the list")

        result = items[position:end]
        position = end
        return result

    return sample


def make_sample_ahd_words() -> SampleFunction:
    """Sample k words from the AHD lexicon.

    # read from data/words.json, select entries that are in the entries with attr_i==0, select k items
    # starting from the head, on the next call, start at k, then k*2, etc. until the end of the list,
    # the error should be raised if k is larger than the number of remaining words in the list.
    """
    ahd_words = []
    with open("data/words.json", "r", encoding="utf-8") as f:
        import json

        data = json.load(f)
        entries = data["entries"]
        ahd_words = [entry["word"] for entry in entries if entry.get("attr_i") == 0]
        return make_sampler(ahd_words)


if __name__ == "__main__":
    # Demonstration: a 500,000-word lexicon, sampled without replacement within
    # each call. Replace this function with the real Wordnik-backed function.
    DEMO_LEXICON_SIZE = 500_000
    demo_rng = random.Random(20260814)
    fn = make_sample_ahd_words()

    def sample_words(k: int) -> list[str]:
        return list(fn(k))

    result, saved_samples = estimate_sequentially(
        sample_words,
        k=500,
        initial_samples=5,
        batch_samples=5,
        target_relative_half_width=0.20,
        max_samples=10,
        within_sample_replacement=False,
        confidence=0.95,
        bootstrap_reps=500,  # Use 5,000-10,000 for a final reported result.
        seed=20260814,
    )
    print("\nFinal estimate\n--------------")
    print(result.summary())
