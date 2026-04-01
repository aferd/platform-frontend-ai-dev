interface Props {
  total: number;
  limit: number;
  offset: number;
  onChange: (newOffset: number) => void;
}

export default function Pagination({ total, limit, offset, onChange }: Props) {
  const totalPages = Math.ceil(total / limit);
  const currentPage = Math.floor(offset / limit) + 1;

  if (totalPages <= 1) return null;

  return (
    <div className="pagination">
      <button
        disabled={currentPage <= 1}
        onClick={() => onChange(offset - limit)}
      >
        Prev
      </button>
      <span className="pagination-info">
        Page {currentPage} of {totalPages} ({total} total)
      </span>
      <button
        disabled={currentPage >= totalPages}
        onClick={() => onChange(offset + limit)}
      >
        Next
      </button>
    </div>
  );
}
