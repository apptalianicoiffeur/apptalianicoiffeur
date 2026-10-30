/**
 * Services management: add / edit / delete / disable haircut types with
 * name, price, estimated duration and an optional image.
 */
import { useEffect, useState } from 'react';
import { addDoc, collection, deleteDoc, doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { Pencil, Plus, Scissors, Trash2 } from 'lucide-react';
import t from '../../i18n/ar';
import { db, COLLECTIONS } from '../../services/bootstrap';
import { useToast } from '../../context/ToastContext';
import { useServices } from '../../hooks/useServices';
import { Field, Modal, Spinner, Toggle, EmptyState, FullSpinner } from '../../components/ui';
import ServiceCard from '../../components/ServiceCard';

/** Add / edit form modal. */
function ServiceModal({ open, service, onClose, onSaved }) {
  const { toast } = useToast();
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [duration, setDuration] = useState('');
  const [image, setImage] = useState('');
  const [active, setActive] = useState(true);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setName(service?.name || '');
      setPrice(service?.price ?? '');
      setDuration(service?.estimatedMinutes ?? 30);
      setImage(service?.image || '');
      setActive(service?.active !== false);
      setErrors({});
    }
  }, [open, service]);

  const submit = async () => {
    const errs = {};
    if (!name.trim()) errs.name = t.validation.fieldRequired;
    if (price === '' || Number(price) < 0 || Number.isNaN(Number(price))) errs.price = t.validation.priceInvalid;
    if (!duration || Number(duration) <= 0) errs.duration = t.validation.durationInvalid;
    setErrors(errs);
    if (Object.keys(errs).length) return;

    setBusy(true);
    try {
      const payload = {
        name: name.trim(),
        price: Number(price),
        estimatedMinutes: Number(duration),
        image: image.trim(),
        active,
      };
      if (service?.id) {
        await updateDoc(doc(db, COLLECTIONS.SERVICES, service.id), payload);
      } else {
        await addDoc(collection(db, COLLECTIONS.SERVICES), {
          ...payload,
          createdAt: serverTimestamp(),
        });
      }
      toast(t.owner.serviceSaved);
      onSaved?.();
      onClose();
    } catch {
      toast(t.errors.actionFailed, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={service ? t.owner.editService : t.owner.addService}
      footer={
        <div className="flex gap-2">
          <button className="btn-ghost flex-1" onClick={onClose}>
            {t.app.cancel}
          </button>
          <button className="btn-gold flex-1" disabled={busy} onClick={submit}>
            {busy ? <Spinner size={16} /> : t.app.save}
          </button>
        </div>
      }
    >
      <Field label={t.owner.serviceName} error={errors.name}>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t.owner.servicePrice} error={errors.price}>
          <input
            className="input"
            inputMode="numeric"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
          />
        </Field>
        <Field label={t.owner.serviceDuration} error={errors.duration}>
          <input
            className="input"
            inputMode="numeric"
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
          />
        </Field>
      </div>
      <Field label={t.owner.serviceImage} hint={t.app.optional}>
        <input className="input" dir="ltr" value={image} onChange={(e) => setImage(e.target.value)} />
      </Field>
      <div className="flex items-center justify-between bg-ink-700/60 rounded-xl px-4 py-3">
        <span className="text-sm font-bold">{t.owner.serviceActive}</span>
        <Toggle checked={active} onChange={setActive} ariaLabel={t.owner.serviceActive} />
      </div>
    </Modal>
  );
}

export default function ServicesPage() {
  const { toast } = useToast();
  const { data: services, loading } = useServices({ all: true });
  const [modal, setModal] = useState({ open: false, service: null });

  const toggleActive = async (service) => {
    try {
      await updateDoc(doc(db, COLLECTIONS.SERVICES, service.id), { active: !service.active });
    } catch {
      toast(t.errors.actionFailed, 'error');
    }
  };

  const remove = async (service) => {
    if (!window.confirm(t.owner.serviceDeleteConfirm)) return;
    try {
      await deleteDoc(doc(db, COLLECTIONS.SERVICES, service.id));
      toast(t.owner.serviceDeleted);
    } catch {
      toast(t.errors.actionFailed, 'error');
    }
  };

  return (
    <div className="animate-fade-in">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl sm:text-2xl font-black">{t.owner.services}</h1>
        <button className="btn-gold btn-sm" onClick={() => setModal({ open: true, service: null })}>
          <Plus size={15} /> {t.owner.addService}
        </button>
      </div>

      {loading ? (
        <FullSpinner />
      ) : services.length === 0 ? (
        <EmptyState
          icon={Scissors}
          title={t.owner.noServices}
          action={
            <button className="btn-gold btn-sm mt-2" onClick={() => setModal({ open: true, service: null })}>
              <Plus size={14} /> {t.owner.addService}
            </button>
          }
        />
      ) : (
        <div className="grid gap-3">
          {services.map((s) => (
            <div key={s.id} className={`card p-4 ${s.active === false ? 'opacity-60' : ''}`}>
              <ServiceCard service={s} />
              <div className="flex items-center justify-between gap-2 mt-3 pt-3 border-t border-ink-500/60">
                <div className="flex items-center gap-2 text-xs text-slate-400">
                  <span>{t.owner.serviceActive}</span>
                  <Toggle
                    checked={s.active !== false}
                    onChange={() => toggleActive(s)}
                    ariaLabel={t.owner.serviceActive}
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    className="btn-ghost btn-sm"
                    onClick={() => setModal({ open: true, service: s })}
                  >
                    <Pencil size={14} /> {t.app.edit}
                  </button>
                  <button className="btn-danger btn-sm" onClick={() => remove(s)}>
                    <Trash2 size={14} /> {t.app.delete}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <ServiceModal
        open={modal.open}
        service={modal.service}
        onClose={() => setModal({ open: false, service: null })}
      />
    </div>
  );
}
